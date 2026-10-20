import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config, isDev } from '../config/config';
import { prisma } from '../shared/db/prisma';
import { redis } from '../shared/redis';
import { AppError } from '../shared/errors/app-error';
import { registerErrorHandler } from './plugins/error-handler';
import { registerAuth } from './plugins/auth';
import { registerAuditHook } from './plugins/audit-hook';
import { healthRoutes } from '../modules/health/health.routes';
import { authRoutes } from '../modules/auth/auth.routes';
import { auditRoutes } from '../modules/audit/audit.routes';
import { vehicleRoutes } from '../modules/vehicles/vehicles.routes';
import { catalogRoutes } from '../modules/catalog/catalog.routes';
import { inventoryRoutes } from '../modules/inventory/inventory.routes';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers.cookie'],
      ...(isDev
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
        : {}),
    },
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
    bodyLimit: 1_048_576, // 1 MB
  });

  // Security
  await app.register(helmet);
  await app.register(cors, {
    origin: config.CORS_ORIGINS.length > 0 ? config.CORS_ORIGINS : false,
    credentials: true,
  });
  await app.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    redis, // counters shared by all API instances
    nameSpace: 'rl:',
    errorResponseBuilder: (_req, ctx) =>
      new AppError('RATE_LIMITED', `Too many requests. Try again in ${ctx.after}.`),
  });

  // Errors
  registerErrorHandler(app);

  // Auth (JWT + cookies + permission guards) and audit trail
  await registerAuth(app);
  registerAuditHook(app);

  // Routes
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(auditRoutes, { prefix: '/api/v1' });
  await app.register(vehicleRoutes, { prefix: '/api/v1' });
  await app.register(catalogRoutes, { prefix: '/api/v1' });
  await app.register(inventoryRoutes, { prefix: '/api/v1' });

  // Close connections when the app shuts down (server stop or end of tests)
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
    await redis.quit();
  });

  return app;
}
