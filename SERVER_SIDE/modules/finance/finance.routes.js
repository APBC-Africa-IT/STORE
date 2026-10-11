/**
 * Finance routes — dashboard, reports, payouts.
 * All require authentication + finance:view or finance:approve_payouts permission.
 */
import { Router } from 'express';
import { protectRoute, requirePermission } from '../../middleware/authMiddleware.js';
import { asyncWrap } from '../../middleware/asyncWrap.js';
import {
  getRevenueReport,
  getVatReport,
  getSupplierPayablesReport,
} from './finance.service.js';
import { prisma } from '../../shared/db/prisma.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
router.use(protectRoute);

// ── Revenue ───────────────────────────────────────────────────────────────
router.get('/revenue', requirePermission('finance:view'), asyncWrap(async (req, res) => {
  const { from, to, channel } = req.query;
  const data = await getRevenueReport({
    from: from ? new Date(from) : new Date(Date.now() - 30 * 86400_000),
    to:   to   ? new Date(to)   : new Date(),
    channel: channel || undefined,
  });
  return res.json({ data });
}));

// ── VAT ───────────────────────────────────────────────────────────────────
router.get('/vat', requirePermission('finance:view'), asyncWrap(async (req, res) => {
  const { from, to } = req.query;
  const data = await getVatReport({
    from: from ? new Date(from) : new Date(Date.now() - 30 * 86400_000),
    to:   to   ? new Date(to)   : new Date(),
  });
  return res.json({ data });
}));

// ── Supplier payables ─────────────────────────────────────────────────────
router.get('/payables', requirePermission('finance:view'), asyncWrap(async (req, res) => {
  const data = await getSupplierPayablesReport();
  return res.json({ data });
}));

// ── Rider payables summary ────────────────────────────────────────────────
router.get('/rider-payables', requirePermission('finance:view'), asyncWrap(async (req, res) => {
  const unpaid = await prisma.riderEarning.groupBy({
    by: ['riderId'],
    where: { payoutId: null },
    _sum: { amountCents: true },
  });
  return res.json({ data: unpaid.map(r => ({ riderId: r.riderId, pendingCents: r._sum.amountCents })) });
}));

// ── COD status ────────────────────────────────────────────────────────────
router.get('/cod', requirePermission('finance:view'), asyncWrap(async (req, res) => {
  const outstanding = await prisma.codCollection.findMany({
    where: { status: 'OUTSTANDING' },
    orderBy: { collectedAt: 'asc' },
  });
  return res.json({ data: outstanding });
}));

// ── Rider payout batch (preview + approve) ────────────────────────────────
router.post('/payouts/riders', requirePermission('finance:approve_payouts'), asyncWrap(async (req, res) => {
  // Batch: group unpaid earnings per rider
  const batches = await prisma.riderEarning.groupBy({
    by: ['riderId'],
    where: { payoutId: null },
    _sum: { amountCents: true },
  });

  const payouts = await Promise.all(batches.map(async b => {
    if (!b._sum.amountCents || b._sum.amountCents <= 0) return null;
    const rider = await prisma.rider.findUnique({ where: { id: b.riderId } });
    return {
      riderId: b.riderId,
      riderName: rider?.name,
      mpesaNumber: rider?.mpesaNumber,
      amountCents: b._sum.amountCents,
    };
  }));

  return res.json({ data: payouts.filter(Boolean) });
}));

router.post('/payouts/:payoutId/approve', requirePermission('finance:approve_payouts'), asyncWrap(async (req, res) => {
  const payout = await prisma.payout.findUniqueOrThrow({ where: { id: req.params.payoutId } });
  if (payout.state !== 'INITIATED') return res.status(409).json({ error: { code: 'CONFLICT', message: 'Payout not in INITIATED state' } });

  // Mark approved and dispatch via BullMQ (workers handle actual B2C call)
  await prisma.payout.update({
    where: { id: payout.id },
    data: { state: 'PENDING', approvedById: req.user.id },
  });

  return res.json({ data: { message: 'Payout queued for processing' } });
}));

// ── Admin dashboard KPIs ──────────────────────────────────────────────────
router.get('/dashboard/kpis', requirePermission('finance:view'), asyncWrap(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    todayOrders,
    pendingOrders,
    activeJobs,
    lowStock,
    pendingPayables,
  ] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: today } } }),
    prisma.order.count({ where: { status: { in: ['PLACED', 'CONFIRMED', 'SOURCING', 'PICKING', 'PACKED'] } } }),
    prisma.logisticsJob.count({ where: { status: { in: ['CREATED', 'ASSIGNED', 'EN_ROUTE'] } } }),
    prisma.inventoryLevel.count({ where: { onHand: { lte: 3 } } }), // approximate low stock
    prisma.codCollection.count({ where: { status: 'OUTSTANDING' } }),
  ]);

  return res.json({ data: { todayOrders, pendingOrders, activeJobs, lowStockCount: lowStock, outstandingCod: pendingPayables } });
}));

export default router;
