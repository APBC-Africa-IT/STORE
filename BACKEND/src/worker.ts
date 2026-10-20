// The background worker: a SEPARATE process from the API (run it with `pnpm worker`).
// It runs scheduled jobs. If it crashes, the API keeps serving customers.

import { Queue, Worker } from 'bullmq';
import pino from 'pino';
import { config, isDev } from './config/config';
import { prisma } from './shared/db/prisma';
import { redis } from './shared/redis';
import { createQueueConnection, QUEUES } from './shared/queue/queues';
import { MAINTENANCE_JOBS } from './jobs/maintenance.jobs';

const log = pino({
  level: config.LOG_LEVEL,
  ...(isDev ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } } : {}),
}).child({ process: 'worker' });

const connection = createQueueConnection();
const maintenance = new Queue(QUEUES.maintenance, { connection });

// Register (or update) each repeating job. Safe to run on every start — no duplicates.
for (const [name, job] of Object.entries(MAINTENANCE_JOBS)) {
  await maintenance.upsertJobScheduler(name, { every: job.everyMs }, {
    name,
    opts: { removeOnComplete: 100, removeOnFail: 500 },
  });
}

const worker = new Worker(
  QUEUES.maintenance,
  async (job) => {
    const handler = MAINTENANCE_JOBS[job.name];
    if (!handler) throw new Error(`No handler for job ${job.name}`);
    await handler.run(log.child({ job: job.name }));
  },
  { connection, concurrency: 1 },
);

worker.on('failed', (job, err) => log.error({ job: job?.name, err }, 'Job failed'));
worker.on('ready', () => log.info({ jobs: Object.keys(MAINTENANCE_JOBS) }, 'Worker started'));

const shutdown = async (signal: string) => {
  log.info(`${signal} received, finishing current job…`);
  await worker.close();
  await maintenance.close();
  await connection.quit();
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
