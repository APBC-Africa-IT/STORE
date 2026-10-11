/**
 * Reports routes — async export jobs, dashboard KPIs, alerts.
 */
import { Router } from 'express';
import { protectRoute, requirePermission } from '../../middleware/authMiddleware.js';
import { asyncWrap } from '../../middleware/asyncWrap.js';
import { QUEUES } from '../../shared/queue/queues.js';
import { createQueue } from '../../shared/queue/bullmq.js';
import { prisma } from '../../shared/db/prisma.js';

const router = Router();
router.use(protectRoute);

// ── Async export trigger ───────────────────────────────────────────────────
router.post('/reports/:reportKey/export', requirePermission('reports:export'), asyncWrap(async (req, res) => {
  const { format = 'csv', filters = {} } = req.body;
  const { reportKey } = req.params;

  const exportsQueue = createQueue(QUEUES.exports);
  const job = await exportsQueue.add('generate-report', {
    reportKey, format, filters, requestedById: req.user.id,
  });

  return res.status(202).json({ data: { jobId: job.id, message: 'Export queued — you will be notified when ready' } });
}));

// ── Export download ────────────────────────────────────────────────────────
router.get('/exports/:id', requirePermission('reports:export'), asyncWrap(async (req, res) => {
  // In production: look up S3 signed URL from a file_objects record
  // For now: return the job status
  const exportsQueue = createQueue(QUEUES.exports);
  const job = await exportsQueue.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Export job not found' } });

  const state = await job.getState();
  const result = job.returnvalue;

  return res.json({ data: { id: req.params.id, state, downloadUrl: result?.downloadUrl || null } });
}));

// ── Admin dashboard KPIs ───────────────────────────────────────────────────
router.get('/dashboard/kpis', requirePermission('orders:read_all'), asyncWrap(async (req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [
    ordersToday,
    pendingOrders,
    activeJobs,
    awaitingPo,
    outstandingCod,
    lowStockCount,
  ] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: today } } }),
    prisma.order.count({ where: { status: { in: ['PLACED', 'CONFIRMED', 'SOURCING', 'PICKING', 'PACKED'] } } }),
    prisma.logisticsJob.count({ where: { status: { in: ['CREATED', 'ASSIGNED', 'EN_ROUTE'] } } }),
    prisma.orderItem.count({ where: { sourcingStatus: 'AWAITING_PO' } }),
    prisma.codCollection.count({ where: { status: 'OUTSTANDING' } }),
    prisma.inventoryLevel.count({ where: { onHand: { lte: 3 } } }),
  ]);

  return res.json({ data: { ordersToday, pendingOrders, activeJobs, awaitingPo, outstandingCod, lowStockCount } });
}));

// ── Alerts ─────────────────────────────────────────────────────────────────
router.get('/dashboard/alerts', requirePermission('orders:read_all'), asyncWrap(async (req, res) => {
  const cutoff24h = new Date(Date.now() - 24 * 3600_000);
  const cutoff30m = new Date(Date.now() - 30 * 60_000);

  const [
    overdueDeliveries,
    overduePos,
    oldCod,
    pendingPayments,
    failedJobs,
  ] = await Promise.all([
    prisma.logisticsJob.count({ where: { type: 'DELIVERY', status: { in: ['ASSIGNED', 'EN_ROUTE'] }, etaAt: { lt: new Date() } } }),
    prisma.purchaseOrder.count({ where: { status: 'SENT', sentAt: { lt: new Date(Date.now() - 30 * 60_000) } } }),
    prisma.codCollection.count({ where: { status: 'OUTSTANDING', collectedAt: { lt: cutoff24h } } }),
    prisma.payment.count({ where: { state: 'PENDING', createdAt: { lt: new Date(Date.now() - 10 * 60_000) } } }),
    prisma.logisticsJob.count({ where: { status: 'FAILED' } }),
  ]);

  return res.json({ data: { overdueDeliveries, overduePos, oldCod, pendingPayments, failedJobs } });
}));

export default router;
