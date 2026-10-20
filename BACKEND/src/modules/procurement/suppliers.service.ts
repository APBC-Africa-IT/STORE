import type { Prisma, PrismaClient } from '@prisma/client';
import type { z } from 'zod';
import { AppError } from '../../shared/errors/app-error';
import { nextSupplierCode } from '../../shared/ids/numbers';
import { normalizePartNumber } from '../../shared/text';
import type { Actor } from '../../shared/auth/actor';
import { recordAudit } from '../audit/audit.service';
import { rankCandidates } from './procurement.domain';
import type { CatalogBody, SupplierBody, SupplierStatusBody, SupplierUpdateBody } from './procurement.schemas';

export class SuppliersService {
  constructor(private readonly db: PrismaClient) {}

  async create(input: z.infer<typeof SupplierBody>) {
    return this.db.$transaction(async (tx) => tx.supplier.create({ data: { ...input, code: await nextSupplierCode(tx) } }));
  }

  update(id: string, input: z.infer<typeof SupplierUpdateBody>) {
    return this.db.supplier.update({ where: { id }, data: input as Prisma.SupplierUpdateInput });
  }

  async setStatus(id: string, input: z.infer<typeof SupplierStatusBody>, actor: Actor) {
    const before = await this.get(id);
    const updated = await this.db.supplier.update({ where: { id }, data: { status: input.status, statusReason: input.reason } });
    await recordAudit(this.db, {
      actorId: actor.userId, action: 'supplier.status_changed', entityType: 'supplier', entityId: id,
      before: { status: before.status }, after: { status: input.status }, reason: input.reason, ip: actor.ip, requestId: actor.requestId,
    });
    return updated;
  }

  async get(id: string) {
    const s = await this.db.supplier.findUnique({ where: { id } });
    if (!s) throw new AppError('NOT_FOUND', 'Supplier not found');
    return s;
  }

  list(q: { status?: string | undefined; q?: string | undefined }) {
    return this.db.supplier.findMany({
      where: {
        ...(q.status ? { status: q.status as Prisma.EnumSupplierStatusFilter['equals'] } : {}),
        ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q, mode: 'insensitive' } }] } : {}),
      },
      orderBy: { name: 'asc' },
      take: 200,
    });
  }

  /**
   * Upload or update a supplier's price list. Each line is matched to our product by part number
   * (any OEM/aftermarket number we hold for the product) unless a productId is given.
   */
  async upsertCatalog(supplierId: string, input: z.infer<typeof CatalogBody>) {
    await this.get(supplierId);
    const norms = input.items.map((i) => normalizePartNumber(i.partNumber));
    const matches = await this.db.partNumber.findMany({ where: { normalized: { in: norms } }, select: { normalized: true, productId: true } });
    const productByNorm = new Map(matches.map((m) => [m.normalized, m.productId]));

    let matched = 0;
    await this.db.$transaction(async (tx) => {
      for (const item of input.items) {
        const partNumberNorm = normalizePartNumber(item.partNumber);
        const productId = item.productId ?? productByNorm.get(partNumberNorm) ?? null;
        if (productId) matched++;
        const data = {
          partNumber: item.partNumber, description: item.description, costCents: item.costCents,
          availability: item.availability, productId, lastConfirmedAt: new Date(),
        };
        await tx.supplierCatalogItem.upsert({
          where: { supplierId_partNumberNorm: { supplierId, partNumberNorm } },
          update: data,
          create: { ...data, supplierId, partNumberNorm },
        });
      }
    });
    return { received: input.items.length, matchedToProducts: matched, unmatched: input.items.length - matched };
  }

  catalog(supplierId: string) {
    return this.db.supplierCatalogItem.findMany({
      where: { supplierId },
      include: { product: { select: { id: true, sku: true, name: true } } },
      orderBy: { partNumber: 'asc' },
    });
  }

  /** Suppliers that can supply a product, best first (STAFF ONLY — contains supplier names and costs). */
  async candidates(productId: string) {
    const items = await this.db.supplierCatalogItem.findMany({
      where: { productId, supplier: { status: 'ACTIVE' } },
      include: { supplier: true },
    });
    return rankCandidates(
      items.map((i) => ({
        supplierId: i.supplierId,
        supplierCode: i.supplier.code,
        supplierName: i.supplier.name,
        supplierType: i.supplier.type,
        area: i.supplier.area,
        phone: i.supplier.phone,
        availability: i.availability,
        costCents: i.costCents,
        leadTimeMins: i.supplier.typicalLeadTimeMins,
        partNumber: i.partNumber,
        lastConfirmedAt: i.lastConfirmedAt,
      })),
    );
  }

  /** Fastest sourcing time per product (used by the availability engine). */
  async bestLeadTimes(productIds: string[]) {
    if (productIds.length === 0) return new Map<string, number>();
    const items = await this.db.supplierCatalogItem.findMany({
      where: { productId: { in: productIds }, availability: { not: 'OUT' }, supplier: { status: 'ACTIVE' } },
      select: { productId: true, supplier: { select: { typicalLeadTimeMins: true } } },
    });
    const best = new Map<string, number>();
    for (const i of items) {
      const lt = i.supplier.typicalLeadTimeMins;
      if (i.productId && (!best.has(i.productId) || lt < best.get(i.productId)!)) best.set(i.productId, lt);
    }
    return best;
  }
}
