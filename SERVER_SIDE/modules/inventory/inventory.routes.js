import { Router } from 'express';
import { asyncWrap } from '../../middleware/asyncWrap.js';
import { protectRoute, requirePermission } from '../../middleware/authMiddleware.js';
import { PERMISSIONS } from '../../shared/auth/permissions.js';
import * as svc from './inventory.service.js';

const router = Router();

router.get('/admin/inventory', protectRoute, requirePermission(PERMISSIONS.INVENTORY_VIEW),
  asyncWrap(async (req, res) => {
    const low = await svc.getLowStockProducts();
    res.json({ data: { lowStock: low } });
  }));

router.get('/admin/inventory/low-stock', protectRoute, requirePermission(PERMISSIONS.INVENTORY_VIEW),
  asyncWrap(async (req, res) => res.json({ data: await svc.getLowStockProducts() })));

router.get('/admin/inventory/products/:id', protectRoute, requirePermission(PERMISSIONS.INVENTORY_VIEW),
  asyncWrap(async (req, res) => res.json({ data: await svc.getLevels(req.params.id) })));

router.post('/admin/inventory/adjustments', protectRoute, requirePermission(PERMISSIONS.INVENTORY_ADJUST),
  asyncWrap(async (req, res) => {
    const { productId, locationId, delta, reason, note } = req.body;
    await svc.adjustStock({ productId, locationId, delta, reason, note, actor: { userId: req.user.id, ip: req.ip } });
    res.json({ data: { message: 'Adjustment applied' } });
  }));

// Locations / Bins
router.get('/admin/locations', protectRoute, requirePermission(PERMISSIONS.INVENTORY_VIEW),
  asyncWrap(async (req, res) => {
    const { prisma } = await import('../../shared/db/prisma.js');
    res.json({ data: await prisma.location.findMany({ include: { bins: true } }) });
  }));

router.post('/admin/locations', protectRoute, requirePermission(PERMISSIONS.INVENTORY_ADJUST),
  asyncWrap(async (req, res) => {
    const { prisma } = await import('../../shared/db/prisma.js');
    const loc = await prisma.location.create({ data: req.body });
    res.status(201).json({ data: loc });
  }));

// Stocktake
router.post('/admin/stocktakes', protectRoute, requirePermission(PERMISSIONS.INVENTORY_ADJUST),
  asyncWrap(async (req, res) => {
    const st = await svc.openStocktake({ ...req.body, startedById: req.user.id });
    res.status(201).json({ data: st });
  }));

router.post('/admin/stocktakes/:id/counts', protectRoute, requirePermission(PERMISSIONS.INVENTORY_ADJUST),
  asyncWrap(async (req, res) => {
    const line = await svc.submitStocktakeCount({ stocktakeId: req.params.id, ...req.body, countedById: req.user.id });
    res.json({ data: line });
  }));

router.post('/admin/stocktakes/:id/approve', protectRoute, requirePermission(PERMISSIONS.INVENTORY_APPROVE_STOCKTAKE),
  asyncWrap(async (req, res) => {
    const st = await svc.approveStocktake(req.params.id, { userId: req.user.id, ip: req.ip });
    res.json({ data: st });
  }));

export default router;
