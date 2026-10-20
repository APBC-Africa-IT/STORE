import { config } from './config/config';
import { buildApp } from './app/build-app';
import { prisma } from './shared/db/prisma';

const app = await buildApp();

try {
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Graceful shutdown: finish in-flight requests, then close the DB pool.
const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down...`);
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
