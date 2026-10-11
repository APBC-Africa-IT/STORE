import { Router } from 'express';
import { asyncWrap } from '../../middleware/asyncWrap.js';
import { protectRoute, optionalAuth, requirePermission } from '../../middleware/authMiddleware.js';
import { PERMISSIONS } from '../../shared/auth/permissions.js';
import * as svc from './catalog.service.js';

const router = Router();

// ── Public / Customer ──────────────────────────────────────────────────────
router.get('/categories',       asyncWrap(async (req, res) => res.json({ data: await svc.getCategories() })));
router.get('/brands',           asyncWrap(async (req, res) => res.json({ data: await svc.getBrands() })));
router.get('/search/suggest',   asyncWrap(async (req, res) => res.json({ data: await svc.suggest(req.query.q) })));
router.get('/part-numbers/:number', asyncWrap(async (req, res) => res.json({ data: await svc.lookupByPartNumber(req.params.number) })));

router.get('/products', optionalAuth, asyncWrap(async (req, res) => {
  const result = await svc.searchProducts(req.query);
  res.json({ data: result });
}));

router.get('/products/:slug', optionalAuth, asyncWrap(async (req, res) => {
  const product = await svc.getProductBySlug(req.params.slug, req.query.vehicleId);
  res.json({ data: product });
}));

router.get('/products/:id/availability', optionalAuth, asyncWrap(async (req, res) => {
  const avail = await svc.getAvailability(req.params.id, req.query.zoneId);
  res.json({ data: avail });
}));

// ── Vehicles / YMM ─────────────────────────────────────────────────────────
router.get('/vehicles/years',  asyncWrap(async (req, res) => res.json({ data: await svc.getYears() })));
router.get('/vehicles/makes',  asyncWrap(async (req, res) => res.json({ data: await svc.getMakesForYear(parseInt(req.query.year)) })));
router.get('/vehicles/models', asyncWrap(async (req, res) => res.json({ data: await svc.getModelsForMakeYear(req.query.makeId, parseInt(req.query.year)) })));

// ── Admin ───────────────────────────────────────────────────────────────────
router.post('/admin/products', protectRoute, requirePermission(PERMISSIONS.CATALOG_WRITE),
  asyncWrap(async (req, res) => {
    const product = await svc.createProduct(req.body, { userId: req.user.id, ip: req.ip });
    res.status(201).json({ data: product });
  }));

router.patch('/admin/products/:id', protectRoute, requirePermission(PERMISSIONS.CATALOG_WRITE),
  asyncWrap(async (req, res) => {
    const product = await svc.updateProduct(req.params.id, req.body, { userId: req.user.id, ip: req.ip });
    res.json({ data: product });
  }));

router.post('/admin/products/:id/archive', protectRoute, requirePermission(PERMISSIONS.CATALOG_WRITE),
  asyncWrap(async (req, res) => {
    const product = await svc.archiveProduct(req.params.id, { userId: req.user.id, ip: req.ip });
    res.json({ data: product });
  }));

router.post('/admin/categories', protectRoute, requirePermission(PERMISSIONS.CATALOG_WRITE),
  asyncWrap(async (req, res) => {
    const cat = await svc.upsertCategory(req.body, { userId: req.user.id, ip: req.ip });
    res.status(201).json({ data: cat });
  }));

router.post('/admin/products/:id/fitments', protectRoute, requirePermission(PERMISSIONS.CATALOG_WRITE),
  asyncWrap(async (req, res) => {
    const fitment = await svc.addFitment({ productId: req.params.id, ...req.body });
    res.status(201).json({ data: fitment });
  }));

router.post('/admin/products/:id/part-numbers', protectRoute, requirePermission(PERMISSIONS.CATALOG_WRITE),
  asyncWrap(async (req, res) => {
    const pn = await svc.addPartNumber({ productId: req.params.id, ...req.body });
    res.status(201).json({ data: pn });
  }));

export default router;
