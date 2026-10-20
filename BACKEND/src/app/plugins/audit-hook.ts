import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/db/prisma';
import { recordAudit } from '../../modules/audit/audit.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const AUDITED_USER_TYPES = new Set(['STAFF', 'SUPPLIER_USER']);

/**
 * Safety net for BR-010: every mutating request by staff or suppliers is logged,
 * even if a developer forgets an explicit recordAudit() call in a service.
 */
export function registerAuditHook(app: FastifyInstance) {
  app.addHook('onResponse', async (request, reply) => {
    const user = request.user;
    if (!user || !MUTATING.has(request.method) || !AUDITED_USER_TYPES.has(user.typ)) return;

    try {
      await recordAudit(prisma, {
        actorId: user.sub,
        actorRole: user.roles.join(','),
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
        action: `http.${request.method} ${request.routeOptions.url ?? request.url}`,
        entityType: 'http_request',
        after: { statusCode: reply.statusCode },
        requestId: request.id,
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to write audit log');
    }
  });
}
