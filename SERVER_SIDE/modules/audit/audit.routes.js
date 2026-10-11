/**
 * Audit routes — staff-only, read-only log viewer.
 */
import { Router } from 'express';
import { protectRoute, requirePermission } from '../../middleware/authMiddleware.js';
import { asyncWrap } from '../../middleware/asyncWrap.js';
import { queryAuditLogs } from './audit.service.js';

const router = Router();

router.get(
  '/',
  protectRoute,
  requirePermission('audit:view'),
  asyncWrap(async (req, res) => {
    const { entityType, entityId, actorId, action, from, to, page = 1, pageSize = 50 } = req.query;
    const result = await queryAuditLogs({
      entityType, entityId, actorId, action, from, to,
      page: Number(page),
      pageSize: Math.min(Number(pageSize), 200),
    });
    return res.json({ data: result.logs, page: { page: result.page, pageSize: result.pageSize, total: result.total } });
  })
);

export default router;
