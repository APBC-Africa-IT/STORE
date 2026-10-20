import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/db/prisma';
import { redis } from '../../shared/redis';

export async function healthRoutes(app: FastifyInstance) {
  // Liveness: is the process up?
  app.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok', service: 'myspares-api' }));

  // Readiness: can we reach the database and Redis?
  app.get('/ready', { config: { rateLimit: false } }, async (_request, reply) => {
    const [database, cache] = await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => 'up' as const).catch(() => 'down' as const),
      redis.ping().then(() => 'up' as const).catch(() => 'down' as const),
    ]);
    const ready = database === 'up' && cache === 'up';
    return reply.status(ready ? 200 : 503).send({ status: ready ? 'ready' : 'not_ready', database, redis: cache });
  });
}
