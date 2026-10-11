/**
 * Catalogue service — products, categories, brands, part numbers,
 * fitment, vehicles, and the availability engine.
 */
import { prisma } from '../../shared/db/prisma.js';
import { redis } from '../../shared/db/redis.js';
import { AppError } from '../../shared/errors/codes.js';
import { emitOutboxEvent } from '../../shared/events/outbox.js';
import { EVENTS } from '../../shared/events/event-types.js';
import { recordAudit } from '../audit/audit.service.js';
import { computeReadyBy } from '../../shared/time/index.js';

// ── Settings helper ────────────────────────────────────────────────────────
async function getSetting(key, defaultVal) {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row ? row.value : defaultVal;
}

// ── Availability engine (§8.1) ─────────────────────────────────────────────
/**
 * Resolves product availability to one of five statuses.
 * Result is cached in Redis for 30s per product+location version.
 */
export async function getAvailability(productId, zoneId = null) {
  // Always recompute from DB at checkout — caching is for browsing only
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      inventory: true,
      supplierItems: {
        where: { supplier: { status: 'ACTIVE' } },
        include: { supplier: true },
      },
    },
  });
  if (!product || product.status !== 'ACTIVE') return { status: 'UNAVAILABLE' };

  // Sum available across all sellable inventory levels
  const totalOnHand  = product.inventory.reduce((s, l) => s + l.onHand, 0);
  const totalReserved = product.inventory.reduce((s, l) => s + l.reserved, 0);
  const available    = totalOnHand - totalReserved;
  const low          = product.lowStockThreshold ?? 3;

  if (available > low) return { status: 'AVAILABLE', available };
  if (available >= 1)  return { status: 'LOW_STOCK', available };

  // Out of stock — find next action
  if (product.isSourceable) {
    const candidates = product.supplierItems.filter(si =>
      ['IN_STOCK', 'LOW', 'UNKNOWN'].includes(si.availability) && si.costCents > 0
    );
    if (candidates.length > 0) {
      const best = candidates.sort((a, b) => a.supplier.typicalLeadTimeMins - b.supplier.typicalLeadTimeMins)[0];
      const leadTimeMins = Math.min(
        best.supplier.typicalLeadTimeMins,
        product.sourcingLeadTimeMins ?? Infinity
      );

      const settings = {
        sameDayCutoff:    await getSetting('sourcing.sameDayCutoff', '14:00'),
        hubProcessingMins: await getSetting('sourcing.hubProcessingMins', 45),
        openTime:         await getSetting('business.openTime', '08:00'),
        closeTime:        await getSetting('business.closeTime', '18:00'),
        workingDays:      await getSetting('business.workingDays', [1,2,3,4,5,6]),
      };
      const readyBy = computeReadyBy(new Date(), leadTimeMins, settings);
      return { status: 'AVAILABLE_TO_ORDER', leadTimeMins, readyBy };
    }
  }

  return { status: 'RARE_PART_REQUEST', suggestPartRequest: true };
}

// ── Product CRUD ────────────────────────────────────────────────────────────
export async function createProduct(data, actor) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({ data });
    await emitOutboxEvent(EVENTS.PRODUCT_CREATED, 'product', product.id, { productId: product.id }, tx);
    await recordAudit({ actor, action: 'product.created', entityType: 'product', entityId: product.id, after: data }, tx);
    return product;
  });
}

export async function updateProduct(id, data, actor) {
  const before = await prisma.product.findUnique({ where: { id } });
  if (!before) throw new AppError('NOT_FOUND', 'Product not found');

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.update({ where: { id }, data });
    await emitOutboxEvent(EVENTS.PRODUCT_UPDATED, 'product', id, { productId: id }, tx);
    if (data.retailPriceCents !== undefined && data.retailPriceCents !== before.retailPriceCents) {
      await emitOutboxEvent(EVENTS.PRODUCT_PRICE_CHANGED, 'product', id, {
        oldPrice: before.retailPriceCents, newPrice: data.retailPriceCents,
      }, tx);
    }
    await recordAudit({ actor, action: 'product.updated', entityType: 'product', entityId: id, before, after: data }, tx);
    return product;
  });
}

export async function archiveProduct(id, actor) {
  const product = await prisma.product.update({ where: { id }, data: { status: 'ARCHIVED' } });
  await recordAudit({ actor, action: 'product.archived', entityType: 'product', entityId: id }, prisma);
  return product;
}

// ── Product search ──────────────────────────────────────────────────────────
export async function searchProducts({ q, category, brand, vehicleId, origin, grade,
  priceMin, priceMax, availability, sort, cursor, limit = 20, page, pageSize }) {

  const take = Math.min(parseInt(limit), 100);
  const where = { status: 'ACTIVE' };

  if (category) where.category = { slug: category };
  if (brand)    where.brand    = { slug: brand };
  if (origin)   where.origin   = origin;
  if (grade)    where.qualityGrade = grade;
  if (priceMin || priceMax) {
    where.retailPriceCents = {};
    if (priceMin) where.retailPriceCents.gte = parseInt(priceMin);
    if (priceMax) where.retailPriceCents.lte = parseInt(priceMax);
  }
  if (vehicleId) {
    where.fitments = { some: { vehicleId } };
  }

  // Full-text search using Postgres tsvector
  let orderBy = [{ createdAt: 'desc' }];
  if (sort === 'price_asc')  orderBy = [{ retailPriceCents: 'asc' }];
  if (sort === 'price_desc') orderBy = [{ retailPriceCents: 'desc' }];

  let products;
  if (q) {
    // Raw SQL for FTS
    products = await prisma.$queryRaw`
      SELECT p.id, p.sku, p.slug, p.name, p.description,
             p.retail_price_cents, p.sale_price_cents, p.status,
             p.quality_grade, p.origin, p.condition,
             p.low_stock_threshold, p.is_sourceable,
             ts_rank(p.search_vector, plainto_tsquery('english', ${q})) AS rank
      FROM products p
      WHERE p.status = 'ACTIVE'
        AND (p.search_vector @@ plainto_tsquery('english', ${q})
             OR p.name % ${q})
      ORDER BY rank DESC, p.created_at DESC
      LIMIT ${take}
    `;
  } else {
    products = await prisma.product.findMany({
      where,
      include: { brand: true, category: true },
      orderBy,
      take,
    });
  }

  // Zero results → suggest part request
  const suggestPartRequest = products.length === 0;
  return { products, suggestPartRequest };
}

export async function getProductBySlug(slug, vehicleId) {
  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      brand: true, category: true,
      partNumbers: true,
      media: { orderBy: { sortOrder: 'asc' } },
      fitments: vehicleId ? { where: { vehicleId } } : true,
    },
  });
  if (!product || product.status === 'ARCHIVED') throw new AppError('NOT_FOUND', 'Product not found');
  return product;
}

// ── Categories / Brands ─────────────────────────────────────────────────────
export async function getCategories() {
  return prisma.category.findMany({ orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }] });
}

export async function getBrands() {
  return prisma.brand.findMany({ orderBy: { name: 'asc' } });
}

export async function upsertCategory(data, actor) {
  const cat = data.id
    ? await prisma.category.update({ where: { id: data.id }, data })
    : await prisma.category.create({ data });
  await recordAudit({ actor, action: 'category.upserted', entityType: 'category', entityId: cat.id }, prisma);
  return cat;
}

// ── Part numbers / cross-refs ───────────────────────────────────────────────
export async function addPartNumber({ productId, type, number, manufacturer }) {
  const normalized = number.toUpperCase().replace(/[\s\-]/g, '');
  return prisma.partNumber.upsert({
    where: { productId_type_normalized: { productId, type, normalized } },
    update: { manufacturer },
    create: { productId, type, number, normalized, manufacturer },
  });
}

export async function lookupByPartNumber(number) {
  const normalized = number.toUpperCase().replace(/[\s\-]/g, '');
  const pns = await prisma.partNumber.findMany({
    where: { normalized },
    include: { product: { include: { brand: true, category: true } } },
  });
  return pns.map(pn => pn.product);
}

// ── Vehicles / YMM cascade ──────────────────────────────────────────────────
export async function getYears() {
  const vehicles = await prisma.vehicle.findMany({ select: { yearFrom: true, yearTo: true } });
  const years = new Set();
  vehicles.forEach(v => {
    for (let y = v.yearFrom; y <= v.yearTo; y++) years.add(y);
  });
  return [...years].sort((a, b) => b - a);
}

export async function getMakesForYear(year) {
  const cacheKey = `ymm:makes:${year}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const models = await prisma.vehicleModel.findMany({
    where: { vehicles: { some: { yearFrom: { lte: year }, yearTo: { gte: year } } } },
    include: { make: true },
    distinct: ['makeId'],
  });
  const makes = [...new Map(models.map(m => [m.makeId, m.make])).values()];
  await redis.setex(cacheKey, 86400, JSON.stringify(makes));
  return makes;
}

export async function getModelsForMakeYear(makeId, year) {
  const cacheKey = `ymm:models:${makeId}:${year}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const vehicles = await prisma.vehicle.findMany({
    where: { model: { makeId }, yearFrom: { lte: year }, yearTo: { gte: year } },
    include: { model: true },
    distinct: ['modelId'],
  });
  const models = [...new Map(vehicles.map(v => [v.modelId, v.model])).values()];
  await redis.setex(cacheKey, 86400, JSON.stringify(models));
  return models;
}

// ── Fitment management ──────────────────────────────────────────────────────
export async function addFitment({ productId, vehicleId, notes, position }) {
  return prisma.productFitment.upsert({
    where: { productId_vehicleId: { productId, vehicleId } },
    update: { notes, position },
    create: { productId, vehicleId, notes, position },
  });
}

// ── Search suggest ───────────────────────────────────────────────────────────
export async function suggest(q) {
  if (!q || q.length < 2) return [];
  const results = await prisma.$queryRaw`
    SELECT DISTINCT name FROM products
    WHERE name ILIKE ${q + '%'} AND status = 'ACTIVE'
    LIMIT 10
  `;
  return results.map(r => r.name);
}
