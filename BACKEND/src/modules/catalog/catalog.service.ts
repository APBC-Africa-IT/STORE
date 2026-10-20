import type { Category, Prisma } from '@prisma/client';
import type { z } from 'zod';
import { AppError } from '../../shared/errors/app-error';
import { normalizePartNumber, slugify } from '../../shared/text';
import { toPage } from '../../shared/pagination';
import { can, type Actor } from '../../shared/auth/actor';
import { recordAudit } from '../audit/audit.service';
import { checkPriceFloor } from './pricing.domain';
import type { CatalogRepository } from './catalog.repository';
import type {
  BrandCreateBody, BrandUpdateBody, CategoryCreateBody, CategoryUpdateBody, FitmentsBody,
  PartNumbersBody, ProductCreateBody, ProductListQuery, ProductUpdateBody,
} from './catalog.schemas';

type CategoryNode = Pick<Category, 'id' | 'name' | 'slug' | 'sortOrder'> & { children: CategoryNode[] };

const COST_FIELDS = ['lastCostCents', 'minMarginBps'] as const;

export class CatalogService {
  constructor(private readonly repo: CatalogRepository) {}

  // ───────────── Categories ─────────────

  async categoryTree(onlyActive = true): Promise<CategoryNode[]> {
    const all = (await this.repo.allCategories()).filter((c) => !onlyActive || c.isActive);
    const byParent = new Map<string | null, Category[]>();
    for (const c of all) byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c]);
    const build = (parentId: string | null): CategoryNode[] =>
      (byParent.get(parentId) ?? []).map((c) => ({
        id: c.id, name: c.name, slug: c.slug, sortOrder: c.sortOrder, children: build(c.id),
      }));
    return build(null);
  }

  /** A category id plus all its descendants (so "Brakes" also returns "Brake Pads"). */
  private async categoryWithDescendants(slug: string): Promise<string[] | null> {
    const all = await this.repo.allCategories();
    const root = all.find((c) => c.slug === slug);
    if (!root) return null;
    const ids = [root.id];
    for (let i = 0; i < ids.length; i++) {
      for (const c of all) if (c.parentId === ids[i]) ids.push(c.id);
    }
    return ids;
  }

  createCategory(input: z.infer<typeof CategoryCreateBody>) {
    return this.repo.createCategory({
      name: input.name,
      slug: input.slug ?? slugify(input.name),
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    });
  }

  async updateCategory(id: string, input: z.infer<typeof CategoryUpdateBody>) {
    if (input.parentId === id) throw new AppError('VALIDATION_FAILED', 'A category cannot be its own parent');
    return this.repo.updateCategory(id, stripUndefined(input));
  }

  // ───────────── Brands ─────────────

  listBrands(onlyActive = true) {
    return this.repo.listBrands(onlyActive);
  }

  createBrand(input: z.infer<typeof BrandCreateBody>) {
    return this.repo.createBrand({ name: input.name, slug: input.slug ?? slugify(input.name), isActive: input.isActive });
  }

  updateBrand(id: string, input: z.infer<typeof BrandUpdateBody>) {
    return this.repo.updateBrand(id, stripUndefined(input));
  }

  // ───────────── Products: read ─────────────

  async listProducts(q: ProductListQuery, opts: { publicOnly: boolean; status?: Prisma.ProductWhereInput['status'] }) {
    const and: Prisma.ProductWhereInput[] = [];

    if (opts.publicOnly) and.push({ status: 'ACTIVE' });
    else if (opts.status) and.push({ status: opts.status });

    if (q.category) {
      const ids = await this.categoryWithDescendants(q.category);
      if (!ids) return toPage([], q.limit);
      and.push({ categoryId: { in: ids } });
    }
    if (q.brand) and.push({ brand: { slug: q.brand } });
    if (q.vehicleId) and.push({ fitments: { some: { vehicleId: q.vehicleId } } });
    if (q.minPrice != null) and.push({ retailPriceCents: { gte: q.minPrice } });
    if (q.maxPrice != null) and.push({ retailPriceCents: { lte: q.maxPrice } });
    if (q.q) {
      const pn = normalizePartNumber(q.q);
      and.push({
        OR: [
          { name: { contains: q.q, mode: 'insensitive' } },
          { sku: { contains: q.q, mode: 'insensitive' } },
          { description: { contains: q.q, mode: 'insensitive' } },
          { brand: { name: { contains: q.q, mode: 'insensitive' } } },
          ...(pn.length >= 3 ? [{ partNumbers: { some: { normalized: { startsWith: pn } } } }] : []),
        ],
      });
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput[] = {
      newest: [{ createdAt: 'desc' as const }],
      price_asc: [{ retailPriceCents: 'asc' as const }],
      price_desc: [{ retailPriceCents: 'desc' as const }],
      name: [{ name: 'asc' as const }],
    }[q.sort];
    orderBy.push({ id: 'asc' }); // stable order for cursor pagination

    const rows = await this.repo.listProducts({
      where: { AND: and },
      orderBy,
      take: q.limit + 1,
      ...(q.cursor ? { cursor: q.cursor } : {}),
    });
    return toPage(rows, q.limit);
  }

  async getPublicProduct(slug: string, vehicleId?: string) {
    const product = await this.repo.findProductBySlug(slug);
    if (!product || product.status !== 'ACTIVE') throw new AppError('NOT_FOUND', 'Product not found');
    const fits = vehicleId ? await this.repo.fitsVehicle(product.id, vehicleId) : null;
    return { product, fits };
  }

  async getProductById(id: string) {
    const product = await this.repo.findProductById(id);
    if (!product) throw new AppError('NOT_FOUND', 'Product not found');
    return product;
  }

  productsByPartNumber(number: string) {
    const normalized = normalizePartNumber(number);
    if (normalized.length < 3) throw new AppError('VALIDATION_FAILED', 'Part number too short');
    return this.repo.productsByPartNumber(normalized);
  }

  // ───────────── Products: write ─────────────

  async createProduct(input: ProductCreateBody, actor: Actor) {
    this.assertCanSetCost(input, actor);
    validateSaleWindow(input);
    this.assertPriceFloor(input, actor);

    const { acknowledgeMarginWarning: _ack, specs, ...data } = input;
    const slug = input.slug ?? (await this.uniqueSlug(input.name));

    const product = await this.repo.createProduct({
      ...data,
      slug,
      ...(specs !== undefined ? { specs: specs ?? undefined } : {}),
    } as Prisma.ProductUncheckedCreateInput);

    await recordAudit(this.repo.db, {
      actorId: actor.userId, action: 'product.created', entityType: 'product', entityId: product.id,
      after: { sku: product.sku, retailPriceCents: product.retailPriceCents, status: product.status },
      ip: actor.ip, requestId: actor.requestId,
    });
    return product;
  }

  async updateProduct(id: string, input: ProductUpdateBody, actor: Actor) {
    const before = await this.getProductById(id);
    this.assertCanSetCost(input, actor);

    // Validate the product as it WILL look after the update.
    const merged = { ...before, ...stripUndefined(input) };
    validateSaleWindow(merged);
    this.assertPriceFloor({ ...merged, acknowledgeMarginWarning: input.acknowledgeMarginWarning }, actor);

    const { acknowledgeMarginWarning: _ack, specs, ...data } = input;
    const updated = await this.repo.updateProduct(id, {
      ...stripUndefined(data),
      ...(specs !== undefined ? { specs: specs ?? undefined } : {}),
    } as Prisma.ProductUncheckedUpdateInput);

    const priceKeys = ['retailPriceCents', 'salePriceCents', 'tradePriceCents', 'lastCostCents', 'status'] as const;
    const changed = priceKeys.filter((k) => before[k] !== updated[k]);
    if (changed.length) {
      await recordAudit(this.repo.db, {
        actorId: actor.userId, action: 'product.updated', entityType: 'product', entityId: id,
        before: Object.fromEntries(changed.map((k) => [k, before[k]])),
        after: Object.fromEntries(changed.map((k) => [k, updated[k]])),
        ip: actor.ip, requestId: actor.requestId,
      });
    }
    return updated;
  }

  /** Replaces the product's full list of part numbers. */
  async setPartNumbers(productId: string, input: z.infer<typeof PartNumbersBody>) {
    await this.getProductById(productId);
    const unique = new Map<string, { type: (typeof input.partNumbers)[number]['type']; number: string; normalized: string; manufacturer: string | null }>();
    for (const pn of input.partNumbers) {
      const normalized = normalizePartNumber(pn.number);
      unique.set(`${pn.type}:${normalized}`, { type: pn.type, number: pn.number, normalized, manufacturer: pn.manufacturer ?? null });
    }
    await this.repo.db.$transaction([
      this.repo.db.partNumber.deleteMany({ where: { productId } }),
      this.repo.db.partNumber.createMany({ data: [...unique.values()].map((pn) => ({ ...pn, productId })) }),
    ]);
    return this.getProductById(productId);
  }

  /** Replaces the product's full fitment list. */
  async setFitments(productId: string, input: z.infer<typeof FitmentsBody>) {
    await this.getProductById(productId);
    const ids = [...new Set(input.fitments.map((f) => f.vehicleId))];
    const found = await this.repo.db.vehicle.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new AppError('VALIDATION_FAILED', 'One or more vehicles do not exist');

    const rows = new Map(input.fitments.map((f) => [f.vehicleId, f]));
    await this.repo.db.$transaction([
      this.repo.db.productFitment.deleteMany({ where: { productId } }),
      this.repo.db.productFitment.createMany({
        data: [...rows.values()].map((f) => ({
          productId, vehicleId: f.vehicleId, notes: f.notes ?? null, position: f.position ?? null, verified: f.verified,
        })),
      }),
    ]);
    return this.getProductById(productId);
  }

  // ───────────── helpers ─────────────

  private assertCanSetCost(input: Record<string, unknown>, actor: Actor) {
    const touchesCost = COST_FIELDS.some((f) => input[f] !== undefined);
    if (touchesCost && !can(actor, 'pricing:view_cost')) {
      throw new AppError('FORBIDDEN', 'You are not allowed to set cost or margin fields');
    }
  }

  private assertPriceFloor(
    p: {
      retailPriceCents: number; salePriceCents?: number | null; tradePriceCents?: number | null;
      vatRateBps: number; lastCostCents?: number | null; minMarginBps?: number | null; acknowledgeMarginWarning?: boolean | undefined;
    },
    actor: Actor,
  ) {
    const prices = [p.retailPriceCents, p.salePriceCents, p.tradePriceCents].filter((x): x is number => x != null);
    for (const price of prices) {
      const result = checkPriceFloor({
        sellingPriceCents: price, vatRateBps: p.vatRateBps, costCents: p.lastCostCents ?? null, minMarginBps: p.minMarginBps ?? null,
      });
      if (result === 'BLOCK_BELOW_COST' && !can(actor, 'finance:approve_below_cost')) {
        throw new AppError('PRICE_BELOW_MARGIN_FLOOR', `Price ${price / 100} KES is below cost. Finance Manager approval required.`);
      }
      if (result === 'WARN_BELOW_MARGIN' && !p.acknowledgeMarginWarning) {
        throw new AppError('PRICE_BELOW_MARGIN_FLOOR', `Price ${price / 100} KES is below the minimum margin. Send acknowledgeMarginWarning: true to save anyway.`);
      }
    }
  }

  private async uniqueSlug(name: string) {
    const base = slugify(name) || 'product';
    let slug = base;
    for (let i = 2; await this.repo.slugExists(slug); i++) slug = `${base}-${i}`;
    return slug;
  }
}

function validateSaleWindow(p: {
  retailPriceCents: number; salePriceCents?: number | null; saleStartsAt?: Date | null; saleEndsAt?: Date | null;
}) {
  if (p.salePriceCents != null && p.salePriceCents >= p.retailPriceCents) {
    throw new AppError('VALIDATION_FAILED', 'Sale price must be lower than the retail price');
  }
  if (p.saleStartsAt && p.saleEndsAt && p.saleStartsAt >= p.saleEndsAt) {
    throw new AppError('VALIDATION_FAILED', 'Sale end must be after sale start');
  }
}

function stripUndefined<T extends object>(obj: T) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}
