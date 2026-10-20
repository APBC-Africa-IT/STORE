import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/db/prisma';

export async function healthRoutes(app: FastifyInstance) {
  // Liveness: is the process up?
  app.get('/health', async () => ({ status: 'ok', service: 'myspares-api' }));

  // Readiness: can we reach the database?
  app.get('/ready', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'up' };
    } catch (err) {
      app.log.error({ err }, 'Database not reachable');
      return reply.status(503).send({ status: 'not_ready', database: 'down' });
    }
  });
}
