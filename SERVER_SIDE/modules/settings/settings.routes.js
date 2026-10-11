/**
 * Settings routes — admin CRUD for business settings.
 */
import { Router } from 'express';
import { protectRoute, requirePermission } from '../../middleware/authMiddleware.js';
import { asyncWrap } from '../../middleware/asyncWrap.js';
import { listSettings, getSetting, updateSetting } from './settings.service.js';

const router = Router();
router.use(protectRoute);

// GET /api/v1/admin/settings
router.get('/', requirePermission('settings:manage'), asyncWrap(async (req, res) => {
  const settings = await listSettings();
  return res.json({ data: settings });
}));

// GET /api/v1/admin/settings/:key
router.get('/:key', requirePermission('settings:manage'), asyncWrap(async (req, res) => {
  const value = await getSetting(req.params.key);
  if (value === null) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Setting not found' } });
  return res.json({ data: { key: req.params.key, value } });
}));

// PATCH /api/v1/admin/settings/:key
router.patch('/:key', requirePermission('settings:manage'), asyncWrap(async (req, res) => {
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'value required' } });

  const actor = { userId: req.user?.id, role: req.user?.type, ip: req.ip };
  const row = await updateSetting(req.params.key, value, actor);
  return res.json({ data: row });
}));

export default router;
