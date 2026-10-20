import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/db/prisma';

const ListQuery = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  actorId: z.uuid().optional(),
  action: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.uuid().optional(),
});

export async function auditRoutes(app: FastifyInstance) {
  app.get(
    '/admin/audit-logs',
    { preHandler: [app.authenticate, app.requirePermission('audit:view')] },
    async (req) => {
      const q = ListQuery.parse(req.query);
      const rows = await prisma.auditLog.findMany({
        where: {
          ...(q.entityType ? { entityType: q.entityType } : {}),
          ...(q.entityId ? { entityId: q.entityId } : {}),
          ...(q.actorId ? { actorId: q.actorId } : {}),
          ...(q.action ? { action: q.action } : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      });
      const hasMore = rows.length > q.limit;
      const data = hasMore ? rows.slice(0, q.limit) : rows;
      return { data, page: { nextCursor: hasMore ? data[data.length - 1]?.id : null, limit: q.limit } };
    },
  );
}
