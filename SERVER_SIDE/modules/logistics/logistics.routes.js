/**
 * Logistics routes — riders, zones, jobs, COD.
 */
import { Router } from 'express';
import { protectRoute, requirePermission } from '../../middleware/authMiddleware.js';
import { asyncWrap } from '../../middleware/asyncWrap.js';
import * as logisticsService from './logistics.service.js';

const router = Router();
router.use(protectRoute);

// ── Riders ─────────────────────────────────────────────────────────────────
router.get('/riders', requirePermission('logistics:manage_riders'), asyncWrap(async (req, res) => {
  const result = await logisticsService.listRiders(req.query);
  return res.json({ data: result.riders, page: { page: result.page, total: result.total } });
}));

router.get('/riders/:id', requirePermission('logistics:manage_riders'), asyncWrap(async (req, res) => {
  return res.json({ data: await logisticsService.getRider(req.params.id) });
}));

router.post('/riders', requirePermission('logistics:manage_riders'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  return res.status(201).json({ data: await logisticsService.createRider(req.body, actor) });
}));

router.post('/riders/:id/approve', requirePermission('logistics:manage_riders'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await logisticsService.approveRider(req.params.id, actor);
  return res.json({ data: { message: 'Rider approved' } });
}));

router.post('/riders/:id/suspend', requirePermission('logistics:manage_riders'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await logisticsService.suspendRider(req.params.id, req.body.reason, actor);
  return res.json({ data: { message: 'Rider suspended' } });
}));

router.post('/riders/:id/reactivate', requirePermission('logistics:manage_riders'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await logisticsService.reactivateRider(req.params.id, actor);
  return res.json({ data: { message: 'Rider reactivated' } });
}));

router.post('/riders/:id/duty', requirePermission('logistics:manage_riders'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await logisticsService.setRiderDuty(req.params.id, Boolean(req.body.isOnDuty), actor);
  return res.json({ data: { message: 'Duty status updated' } });
}));

router.get('/riders/:id/earnings', requirePermission('logistics:manage_riders'), asyncWrap(async (req, res) => {
  const earnings = await logisticsService.getRiderEarnings(req.params.id, { unpaidOnly: req.query.unpaidOnly === 'true' });
  return res.json({ data: earnings });
}));

router.post('/riders/:id/deductions', requirePermission('logistics:manage_riders'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  const result = await logisticsService.createRiderDeduction(req.params.id, req.body, actor);
  return res.status(201).json({ data: result });
}));

// ── Delivery zones ──────────────────────────────────────────────────────────
router.get('/delivery-zones', asyncWrap(async (req, res) => {
  return res.json({ data: await logisticsService.listZones() });
}));

router.post('/delivery-zones', requirePermission('logistics:assign'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  return res.status(201).json({ data: await logisticsService.createZone(req.body, actor) });
}));

router.patch('/delivery-zones/:id', requirePermission('logistics:assign'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  return res.json({ data: await logisticsService.updateZone(req.params.id, req.body, actor) });
}));

// ── Jobs ───────────────────────────────────────────────────────────────────
router.get('/logistics/jobs', requirePermission('logistics:assign'), asyncWrap(async (req, res) => {
  const result = await logisticsService.listJobs(req.query);
  return res.json({ data: result.jobs, page: { page: result.page, total: result.total } });
}));

router.post('/logistics/jobs', requirePermission('logistics:assign'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  return res.status(201).json({ data: await logisticsService.createJob(req.body, actor) });
}));

router.post('/logistics/jobs/:id/assign', requirePermission('logistics:assign'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await logisticsService.assignJob(req.params.id, req.body.riderId, actor);
  return res.json({ data: { message: 'Job assigned' } });
}));

// Generic status update endpoint — used by staff on behalf of rider in Phase 1
const JOB_STATUS_ACTIONS = ['start', 'collected', 'arrived-hub', 'delivered', 'confirm', 'fail', 'cancel'];
JOB_STATUS_ACTIONS.forEach(action => {
  const toStatusMap = {
    start:       'EN_ROUTE',
    collected:   'COLLECTED',
    'arrived-hub': 'DELIVERED_TO_HUB',
    delivered:   'DELIVERED',
    confirm:     'CONFIRMED',
    fail:        'FAILED',
    cancel:      'CANCELLED',
  };
  router.post(`/logistics/jobs/:id/${action}`, requirePermission('logistics:assign'), asyncWrap(async (req, res) => {
    await logisticsService.updateJobStatus(req.params.id, toStatusMap[action], {
      actorId: req.user.id,
      note: req.body.note,
      lat: req.body.lat,
      lng: req.body.lng,
      codAmountReported: req.body.codAmountReported,
      otpCode: req.body.otpCode,
      proofFileId: req.body.proofFileId,
    });
    return res.json({ data: { message: `Job ${action} recorded` } });
  }));
});

// ── COD ────────────────────────────────────────────────────────────────────
router.get('/cod', requirePermission('logistics:reconcile_cod'), asyncWrap(async (req, res) => {
  const data = await logisticsService.getOutstandingCod(req.query);
  return res.json({ data });
}));

router.post('/cod/:id/handover', requirePermission('logistics:reconcile_cod'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await logisticsService.reconcileCod(req.params.id, req.body, actor);
  return res.json({ data: { message: 'COD reconciled' } });
}));

export default router;
