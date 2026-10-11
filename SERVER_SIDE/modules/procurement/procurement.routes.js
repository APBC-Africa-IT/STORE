/**
 * Procurement routes — suppliers, POs, sourcing queue, GRNs.
 */
import { Router } from 'express';
import { protectRoute, requirePermission } from '../../middleware/authMiddleware.js';
import { asyncWrap } from '../../middleware/asyncWrap.js';
import * as procService from './procurement.service.js';

const router = Router();
router.use(protectRoute);

// ── Suppliers ─────────────────────────────────────────────────────────────
router.get('/suppliers', requirePermission('procurement:create_po'), asyncWrap(async (req, res) => {
  const result = await procService.listSuppliers(req.query);
  return res.json({ data: result.suppliers, page: { page: result.page, pageSize: result.pageSize, total: result.total } });
}));

router.get('/suppliers/:id', requirePermission('procurement:create_po'), asyncWrap(async (req, res) => {
  return res.json({ data: await procService.getSupplier(req.params.id) });
}));

router.post('/suppliers', requirePermission('procurement:create_po'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  return res.status(201).json({ data: await procService.createSupplier(req.body, actor) });
}));

router.patch('/suppliers/:id', requirePermission('procurement:create_po'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  return res.json({ data: await procService.updateSupplier(req.params.id, req.body, actor) });
}));

router.post('/suppliers/:id/suspend', requirePermission('procurement:create_po'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await procService.suspendSupplier(req.params.id, req.body.reason, actor);
  return res.json({ data: { message: 'Supplier suspended' } });
}));

router.post('/suppliers/:id/blacklist', requirePermission('procurement:create_po'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await procService.blacklistSupplier(req.params.id, req.body.reason, actor);
  return res.json({ data: { message: 'Supplier blacklisted' } });
}));

router.post('/suppliers/:id/reactivate', requirePermission('procurement:create_po'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await procService.reactivateSupplier(req.params.id, actor);
  return res.json({ data: { message: 'Supplier reactivated' } });
}));

// ── Supplier catalogue ────────────────────────────────────────────────────
router.get('/suppliers/:id/catalog', requirePermission('procurement:create_po'), asyncWrap(async (req, res) => {
  const result = await procService.getSupplierCatalogue(req.params.id, req.query);
  return res.json({ data: result.items, page: { page: result.page, pageSize: result.pageSize, total: result.total } });
}));

router.post('/supplier-prices/:itemId/approve', requirePermission('procurement:approve_supplier_prices'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await procService.approveCatalogPrice(req.params.itemId, actor);
  return res.json({ data: { message: 'Price approved' } });
}));

// ── Sourcing queue ────────────────────────────────────────────────────────
router.get('/sourcing/queue', requirePermission('procurement:create_po'), asyncWrap(async (req, res) => {
  const queue = await procService.getSourcingQueue();
  return res.json({ data: queue });
}));

router.get('/sourcing/candidates', requirePermission('procurement:create_po'), asyncWrap(async (req, res) => {
  const { orderItemId } = req.query;
  if (!orderItemId) return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'orderItemId required' } });
  const candidates = await procService.getSupplierCandidates(orderItemId);
  return res.json({ data: candidates });
}));

// ── Purchase Orders ───────────────────────────────────────────────────────
router.get('/purchase-orders', requirePermission('procurement:create_po'), asyncWrap(async (req, res) => {
  const result = await procService.listPurchaseOrders(req.query);
  return res.json({ data: result.purchaseOrders, page: { page: result.page, pageSize: result.pageSize, total: result.total } });
}));

router.get('/purchase-orders/:id', requirePermission('procurement:create_po'), asyncWrap(async (req, res) => {
  return res.json({ data: await procService.getPurchaseOrder(req.params.id) });
}));

router.post('/purchase-orders', requirePermission('procurement:create_po'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  return res.status(201).json({ data: await procService.createPurchaseOrder(req.body, actor) });
}));

router.post('/purchase-orders/:id/send', requirePermission('procurement:send_po'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  const result = await procService.sendPurchaseOrder(req.params.id, req.body.channel || 'PHONE', actor);
  return res.json({ data: result });
}));

router.post('/purchase-orders/:id/log-supplier-response', requirePermission('procurement:send_po'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await procService.logSupplierResponse(req.params.id, req.body, actor);
  return res.json({ data: { message: 'Supplier response recorded' } });
}));

router.post('/purchase-orders/:id/approve', requirePermission('procurement:approve_restock'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await procService.approveRestockPo(req.params.id, actor);
  return res.json({ data: { message: 'PO approved' } });
}));

router.post('/purchase-orders/:id/cancel', requirePermission('procurement:create_po'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await procService.cancelPurchaseOrder(req.params.id, req.body.reason, actor);
  return res.json({ data: { message: 'PO cancelled' } });
}));

// ── GRNs ──────────────────────────────────────────────────────────────────
router.get('/grns', requirePermission('orders:update_status'), asyncWrap(async (req, res) => {
  const { prisma } = await import('../../shared/db/prisma.js');
  const grns = await prisma.grn.findMany({
    where: req.query.purchaseOrderId ? { purchaseOrderId: req.query.purchaseOrderId } : {},
    include: { lines: true, purchaseOrder: { select: { number: true, supplier: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return res.json({ data: grns });
}));

router.post('/grns', requirePermission('orders:update_status'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  return res.status(201).json({ data: await procService.createGrn(req.body, actor) });
}));

router.patch('/grns/:id/lines/:lineId', requirePermission('orders:update_status'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  const result = await procService.updateGrnLine(req.params.id, req.params.lineId, req.body, actor);
  return res.json({ data: result });
}));

router.post('/grns/:id/lines', requirePermission('orders:update_status'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  const result = await procService.updateGrnLine(req.params.id, null, req.body, actor);
  return res.status(201).json({ data: result });
}));

router.post('/grns/:id/complete', requirePermission('orders:update_status'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  return res.json({ data: await procService.completeGrn(req.params.id, actor) });
}));

export default router;
