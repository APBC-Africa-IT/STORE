/**
 * Vehicles routes — YMM cascade, VIN decode, My Garage.
 */
import { Router } from 'express';
import { protectRoute, requirePermission } from '../../middleware/authMiddleware.js';
import { asyncWrap } from '../../middleware/asyncWrap.js';
import * as vehiclesService from './vehicles.service.js';

const router = Router();

// ── Public YMM cascade ─────────────────────────────────────────────────────
router.get('/vehicles/years', asyncWrap(async (req, res) => {
  return res.json({ data: await vehiclesService.getYears() });
}));

router.get('/vehicles/makes', asyncWrap(async (req, res) => {
  const { year } = req.query;
  if (!year) return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'year required' } });
  return res.json({ data: await vehiclesService.getMakesForYear(year) });
}));

router.get('/vehicles/models', asyncWrap(async (req, res) => {
  const { makeId, year } = req.query;
  if (!makeId || !year) return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'makeId and year required' } });
  return res.json({ data: await vehiclesService.getModelsForMakeYear(makeId, year) });
}));

router.get('/vehicles/variants', asyncWrap(async (req, res) => {
  const { modelId, year } = req.query;
  if (!modelId || !year) return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'modelId and year required' } });
  return res.json({ data: await vehiclesService.getVariantsForModelYear(modelId, year) });
}));

// ── VIN / chassis decode ───────────────────────────────────────────────────
router.get('/vehicles/vin/:vin', asyncWrap(async (req, res) => {
  return res.json({ data: await vehiclesService.decodeVin(req.params.vin) });
}));

// ── My Garage ──────────────────────────────────────────────────────────────
router.get('/me/garage', protectRoute, asyncWrap(async (req, res) => {
  return res.json({ data: await vehiclesService.getGarage(req.user.id) });
}));

router.post('/me/garage', protectRoute, asyncWrap(async (req, res) => {
  const gv = await vehiclesService.addToGarage(req.user.id, req.body);
  return res.status(201).json({ data: gv });
}));

router.patch('/me/garage/:id', protectRoute, asyncWrap(async (req, res) => {
  const gv = await vehiclesService.updateGarageVehicle(req.user.id, req.params.id, req.body);
  return res.json({ data: gv });
}));

router.delete('/me/garage/:id', protectRoute, asyncWrap(async (req, res) => {
  await vehiclesService.removeFromGarage(req.user.id, req.params.id);
  return res.status(204).send();
}));

router.post('/me/garage/:id/activate', protectRoute, asyncWrap(async (req, res) => {
  await vehiclesService.setActiveGarageVehicle(req.user.id, req.params.id);
  return res.json({ data: { message: 'Active vehicle set' } });
}));

// ── Admin vehicle data management ──────────────────────────────────────────
router.post('/admin/vehicles/makes', protectRoute, requirePermission('catalog:write'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, ip: req.ip };
  return res.status(201).json({ data: await vehiclesService.createMake(req.body, actor) });
}));

router.post('/admin/vehicles/models', protectRoute, requirePermission('catalog:write'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, ip: req.ip };
  return res.status(201).json({ data: await vehiclesService.createModel(req.body, actor) });
}));

router.post('/admin/vehicles', protectRoute, requirePermission('catalog:write'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, ip: req.ip };
  return res.status(201).json({ data: await vehiclesService.upsertVehicle(req.body, actor) });
}));

export default router;
