import { Redis } from 'ioredis';
import { config } from '../../config/config';

/** Every queue name in the system lives here. */
export const QUEUES = {
  maintenance: 'maintenance', // scheduled housekeeping jobs
} as const;

/** BullMQ needs its own Redis connection with `maxRetriesPerRequest: null`. */
export function createQueueConnection() {
  return new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
}
