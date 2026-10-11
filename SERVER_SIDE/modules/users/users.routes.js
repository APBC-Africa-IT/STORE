/**
 * Users routes — profile, addresses (customer), admin user management.
 */
import { Router } from 'express';
import { protectRoute, requirePermission } from '../../middleware/authMiddleware.js';
import { asyncWrap } from '../../middleware/asyncWrap.js';
import * as usersService from './users.service.js';

const router = Router();

// ── My Profile ────────────────────────────────────────────────────────────
router.get('/me', protectRoute, asyncWrap(async (req, res) => {
  const profile = await usersService.getProfile(req.user.id);
  return res.json({ data: profile });
}));

router.patch('/me', protectRoute, asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  const { firstName, lastName } = req.body; // email/phone change requires OTP verification first
  const updated = await usersService.updateProfile(req.user.id, { firstName, lastName }, actor);
  return res.json({ data: updated });
}));

// ── Addresses ─────────────────────────────────────────────────────────────
router.get('/me/addresses', protectRoute, asyncWrap(async (req, res) => {
  const addresses = await usersService.listAddresses(req.user.id);
  return res.json({ data: addresses });
}));

router.post('/me/addresses', protectRoute, asyncWrap(async (req, res) => {
  const address = await usersService.createAddress(req.user.id, req.body);
  return res.status(201).json({ data: address });
}));

router.patch('/me/addresses/:id', protectRoute, asyncWrap(async (req, res) => {
  const address = await usersService.updateAddress(req.user.id, req.params.id, req.body);
  return res.json({ data: address });
}));

router.delete('/me/addresses/:id', protectRoute, asyncWrap(async (req, res) => {
  await usersService.deleteAddress(req.user.id, req.params.id);
  return res.status(204).send();
}));

// ── Admin: user management ────────────────────────────────────────────────
router.get('/admin/users', protectRoute, requirePermission('users:manage'), asyncWrap(async (req, res) => {
  const { type, status, q, page, pageSize } = req.query;
  const result = await usersService.listUsers({ type, status, q, page: Number(page || 1), pageSize: Number(pageSize || 25) });
  return res.json({ data: result.users, page: { page: result.page, pageSize: result.pageSize, total: result.total } });
}));

router.get('/admin/users/:id', protectRoute, requirePermission('users:manage'), asyncWrap(async (req, res) => {
  const user = await usersService.getUserDetail(req.params.id);
  return res.json({ data: user });
}));

router.post('/admin/users/:id/assign-role', protectRoute, requirePermission('users:manage_roles'), asyncWrap(async (req, res) => {
  const { roleKey } = req.body;
  if (!roleKey) return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'roleKey required' } });
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await usersService.assignRole(req.params.id, roleKey, actor);
  return res.json({ data: { message: 'Role assigned' } });
}));

router.post('/admin/users/:id/remove-role', protectRoute, requirePermission('users:manage_roles'), asyncWrap(async (req, res) => {
  const { roleKey } = req.body;
  if (!roleKey) return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'roleKey required' } });
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await usersService.removeRole(req.params.id, roleKey, actor);
  return res.json({ data: { message: 'Role removed' } });
}));

router.post('/admin/users/:id/suspend', protectRoute, requirePermission('users:manage'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await usersService.suspendUser(req.params.id, req.body.reason, actor);
  return res.json({ data: { message: 'User suspended' } });
}));

router.post('/admin/users/:id/reactivate', protectRoute, requirePermission('users:manage'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await usersService.reactivateUser(req.params.id, actor);
  return res.json({ data: { message: 'User reactivated' } });
}));

router.delete('/admin/users/:id', protectRoute, requirePermission('users:manage'), asyncWrap(async (req, res) => {
  const actor = { userId: req.user.id, role: req.user.type, ip: req.ip };
  await usersService.deleteUser(req.params.id, actor);
  return res.json({ data: { message: 'User anonymised' } });
}));

router.get('/admin/roles', protectRoute, requirePermission('users:manage_roles'), asyncWrap(async (req, res) => {
  const roles = await usersService.listRoles();
  return res.json({ data: roles });
}));

export default router;
