/**
 * POS routes — shifts, sales, approvals, receipts, end-of-day.
 */
import { Router } from 'express';
import { protectRoute, requirePermission } from '../../middleware/authMiddleware.js';
import { asyncWrap } from '../../middleware/asyncWrap.js';
import * as posService from './pos.service.js';

const router = Router();
router.use(protectRoute);

// ── Shifts ─────────────────────────────────────────────────────────────────
router.post('/shifts/open', requirePermission('pos:manage_shift'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  return res.status(201).json({ data: await posService.openShift(req.body, actor) });
}));

router.get('/shifts/current', requirePermission('pos:sell'), asyncWrap(async (req, res) => {
  const { registerId } = req.query;
  if (!registerId) return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'registerId required' } });
  return res.json({ data: await posService.getCurrentShift(registerId, req.user.id) });
}));

router.post('/shifts/:id/close', requirePermission('pos:manage_shift'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  return res.json({ data: await posService.closeShift(req.params.id, req.body, actor) });
}));

router.post('/shifts/:id/cash-movements', requirePermission('pos:manage_shift'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  return res.status(201).json({ data: await posService.addCashMovement(req.params.id, req.body, actor) });
}));

// ── Product lookup ─────────────────────────────────────────────────────────
router.get('/products/lookup', requirePermission('pos:sell'), asyncWrap(async (req, res) => {
  return res.json({ data: await posService.lookupProduct(req.query) });
}));

// ── POS Quote ──────────────────────────────────────────────────────────────
router.post('/quote', requirePermission('pos:sell'), asyncWrap(async (req, res) => {
  return res.json({ data: await posService.posQuote(req.body) });
}));

// ── POS Sales ──────────────────────────────────────────────────────────────
router.post('/sales', requirePermission('pos:sell'), asyncWrap(async (req, res) => {
  const idempotencyKey = req.headers['idempotency-key'];
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  const result = await posService.createPosSale({ ...req.body, idempotencyKey }, actor);
  return res.status(201).json({ data: result });
}));

router.get('/sales/:id', requirePermission('pos:sell'), asyncWrap(async (req, res) => {
  const { prisma } = await import('../../shared/db/prisma.js');
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: true, payments: true },
  });
  if (!order) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Sale not found' } });
  return res.json({ data: order });
}));

// ── Manager approval token ─────────────────────────────────────────────────
router.post('/approvals', requirePermission('pos:sell'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  return res.json({ data: await posService.requestApprovalToken(req.body, actor) });
}));

// ── Void / Refund ──────────────────────────────────────────────────────────
router.post('/sales/:id/void', requirePermission('pos:sell'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await posService.voidSale(req.params.id, req.body, actor);
  return res.json({ data: { message: 'Sale voided' } });
}));

// ── Receipts ───────────────────────────────────────────────────────────────
router.get('/sales/:id/receipt', requirePermission('pos:sell'), asyncWrap(async (req, res) => {
  return res.json({ data: await posService.getReceipt(req.params.id) });
}));

// ── End-of-day report ──────────────────────────────────────────────────────
router.get('/reports/end-of-day', requirePermission('pos:manage_shift'), asyncWrap(async (req, res) => {
  const { registerId, date } = req.query;
  if (!registerId || !date) return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'registerId and date required' } });
  return res.json({ data: await posService.endOfDayReport(registerId, date) });
}));

export default router;
