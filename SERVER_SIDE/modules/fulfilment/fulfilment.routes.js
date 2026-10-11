/**
 * Fulfilment routes — pick/pack queue, packing slips, labels.
 */
import { Router } from 'express';
import { protectRoute, requirePermission } from '../../middleware/authMiddleware.js';
import { asyncWrap } from '../../middleware/asyncWrap.js';
import * as fulfilmentService from './fulfilment.service.js';

const router = Router();
router.use(protectRoute);

router.get('/fulfilment/queue', requirePermission('orders:update_status'), asyncWrap(async (req, res) => {
  return res.json({ data: await fulfilmentService.getFulfilmentQueue() });
}));

router.post('/orders/:id/pick', requirePermission('orders:update_status'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await fulfilmentService.pickOrder(req.params.id, actor);
  return res.json({ data: { message: 'Order picking started' } });
}));

router.post('/orders/:id/pack', requirePermission('orders:update_status'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await fulfilmentService.packOrder(req.params.id, req.body, actor);
  return res.json({ data: { message: 'Order packed' } });
}));

router.post('/orders/:id/ready-for-collection', requirePermission('orders:update_status'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await fulfilmentService.markReadyForCollection(req.params.id, actor);
  return res.json({ data: { message: 'Order ready for collection' } });
}));

router.get('/orders/:id/packing-slip.pdf', requirePermission('orders:update_status'), asyncWrap(async (req, res) => {
  const pdf = await fulfilmentService.generatePackingSlip(req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="packing-slip-${req.params.id}.pdf"`);
  return res.send(pdf);
}));

router.get('/orders/:id/label.pdf', requirePermission('orders:update_status'), asyncWrap(async (req, res) => {
  const pdf = await fulfilmentService.generatePackageLabel(req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="label-${req.params.id}.pdf"`);
  return res.send(pdf);
}));

export default router;
