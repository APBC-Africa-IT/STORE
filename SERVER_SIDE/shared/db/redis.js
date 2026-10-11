/**
 * Singleton ioredis client.
 * Import `redis` wherever you need cache / locks / BullMQ.
 */
import Redis from 'ioredis';
import config from '../config/index.js';

let _redis = null;

export function getRedis() {
  if (!_redis) {
    _redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false,
      lazyConnect: true,
    });

    _redis.on('error', (err) => {
      // Log but don't crash — the app degrades gracefully without Redis
      console.error('[Redis] connection error:', err.message);
    });

    _redis.on('connect', () => {
      console.log('[Redis] connected');
    });
  }
  return _redis;
}

export const redis = getRedis();
export default redis;
