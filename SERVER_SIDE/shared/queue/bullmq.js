/**
 * BullMQ Queue + Worker factory.
 * Always use these factories — they share the same Redis connection config.
 */
import { Queue, Worker, QueueEvents } from 'bullmq';
import { getRedis } from '../db/redis.js';

const connection = { host: 'localhost', port: 6379 };

// Try to parse the REDIS_URL if available
function getConnection() {
  const url = process.env.REDIS_URL;
  if (url) {
    try {
      const u = new URL(url);
      return {
        host: u.hostname,
        port: parseInt(u.port || '6379'),
        password: u.password || undefined,
      };
    } catch {
      // fall back to defaults
    }
  }
  return connection;
}

const conn = getConnection();

export function createQueue(name, opts = {}) {
  return new Queue(name, { connection: conn, ...opts });
}

export function createWorker(name, processor, opts = {}) {
  return new Worker(name, processor, { connection: conn, ...opts });
}

export function createQueueEvents(name) {
  return new QueueEvents(name, { connection: conn });
}
