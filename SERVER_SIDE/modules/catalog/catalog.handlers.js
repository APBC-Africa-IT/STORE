/**
 * Catalog handlers — HTTP layer between routes and catalog.service.
 * Picks the correct serializer based on the caller's audience.
 */
import * as catalogService from './catalog.service.js';
import { serializeProductPublic, serializeProductStaff, serializeCategory, serializeBrand } from './catalog.serializers.js';

function isStaff(user) {
  return user && ['STAFF', 'SUPPLIER_USER'].includes(user.type);
}

function canViewCost(user) {
  return user?.permissions?.includes('pricing:view_cost') || false;
}

// ── Public product search ─────────────────────────────────────────────────

export async function searchProducts(req, res) {
  const { q, category, brand, vehicleId, origin, grade, priceMin, priceMax,
          availability, sort, cursor, limit = 25 } = req.query;

  const result = await catalogService.searchProducts({
    q, category, brand, vehicleId, origin, grade,
    priceMin: priceMin ? Number(priceMin) : undefined,
    priceMax: priceMax ? Number(priceMax) : undefined,
    availability, sort, cursor, limit: Math.min(Number(limit), 100),
    audience: isStaff(req.user) ? 'staff' : 'public',
  });

  const canCost = canViewCost(req.user);
  const serialized = result.products.map(p =>
    isStaff(req.user)
      ? serializeProductStaff(p, {}, canCost)
      : serializeProductPublic(p)
  );

  return res.json({ data: serialized, page: { nextCursor: result.nextCursor, limit: result.limit } });
}

// ── Product detail ────────────────────────────────────────────────────────

export async function getProduct(req, res) {
  const { slug } = req.params;
  const { vehicleId, zoneId } = req.query;

  const product = await catalogService.getProductBySlug(slug, vehicleId);
  const availability = await catalogService.getAvailability(product.id, zoneId || null);

  const canCost = canViewCost(req.user);
  const dto = isStaff(req.user)
    ? serializeProductStaff(product, { availability }, canCost)
    : serializeProductPublic(product, { availability });

  return res.json({ data: dto });
}

// ── Availability ──────────────────────────────────────────────────────────

export async function getAvailability(req, res) {
  const { id } = req.params;
  const { qty, zoneId } = req.query;
  const availability = await catalogService.getAvailability(id, zoneId || null, Number(qty) || 1);
  return res.json({ data: availability });
}

// ── Categories ────────────────────────────────────────────────────────────

export async function getCategories(req, res) {
  const cats = await catalogService.getCategories();
  return res.json({ data: cats.map(serializeCategory) });
}

// ── Brands ────────────────────────────────────────────────────────────────

export async function getBrands(req, res) {
  const brands = await catalogService.getBrands();
  return res.json({ data: brands.map(serializeBrand) });
}

// ── Search suggest ────────────────────────────────────────────────────────

export async function suggest(req, res) {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json({ data: [] });
  const suggestions = await catalogService.suggest(q);
  return res.json({ data: suggestions });
}

// ── Part number cross-reference lookup ────────────────────────────────────

export async function lookupPartNumber(req, res) {
  const { number } = req.params;
  const results = await catalogService.lookupByPartNumber(number);
  const serialized = results.map(p => serializeProductPublic(p));
  const isEmpty = serialized.length === 0;
  return res.json({ data: serialized, suggestPartRequest: isEmpty });
}

// ── Admin CRUD ────────────────────────────────────────────────────────────

export async function adminCreateProduct(req, res) {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  const product = await catalogService.createProduct(req.body, actor);
  return res.status(201).json({ data: serializeProductStaff(product, {}, true) });
}

export async function adminUpdateProduct(req, res) {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  const product = await catalogService.updateProduct(req.params.id, req.body, actor);
  return res.json({ data: serializeProductStaff(product, {}, true) });
}

export async function adminArchiveProduct(req, res) {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await catalogService.archiveProduct(req.params.id, actor);
  return res.json({ data: { message: 'Product archived' } });
}

export async function adminUpsertCategory(req, res) {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  const cat = await catalogService.upsertCategory(req.body, actor);
  return res.status(200).json({ data: serializeCategory(cat) });
}

export async function adminAddPartNumber(req, res) {
  const { id } = req.params;
  const pn = await catalogService.addPartNumber({ productId: id, ...req.body });
  return res.status(201).json({ data: pn });
}

export async function adminAddFitment(req, res) {
  const { id } = req.params;
  const f = await catalogService.addFitment({ productId: id, ...req.body });
  return res.status(201).json({ data: f });
}
