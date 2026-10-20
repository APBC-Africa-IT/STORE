import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { config, isDev } from '../config/config';
import { registerErrorHandler } from './plugins/error-handler';
import { healthRoutes } from '../modules/health/health.routes';

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

  // Errors
  registerErrorHandler(app);

  // Routes
  await app.register(healthRoutes);
  // await app.register(authRoutes, { prefix: '/api/v1' });  ← Step 4

  return app;
}
