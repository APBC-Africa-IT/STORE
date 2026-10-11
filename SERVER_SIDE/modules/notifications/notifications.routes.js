/**
 * Notifications routes (admin only — view logs, send test).
 */
import { Router } from 'express';
import { protectRoute, requirePermission } from '../../middleware/authMiddleware.js';
import { prisma } from '../../shared/db/prisma.js';
import { asyncWrap } from '../../middleware/asyncWrap.js';

const router = Router();

// GET /api/v1/admin/notifications — list recent notification logs
router.get(
  '/',
  protectRoute,
  requirePermission('audit:view'),
  asyncWrap(async (req, res) => {
    const { page = 1, pageSize = 50, channel, status, recipient } = req.query;
    const where = {};
    if (channel) where.channel = channel;
    if (status) where.status = status;
    if (recipient) where.recipient = { contains: recipient };

    const [logs, total] = await Promise.all([
      prisma.notificationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
      }),
      prisma.notificationLog.count({ where }),
    ]);

    return res.json({ data: logs, page: { page: Number(page), pageSize: Number(pageSize), total } });
  })
);

export default router;
