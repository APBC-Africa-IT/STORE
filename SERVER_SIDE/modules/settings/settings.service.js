/**
 * Settings service — Redis-cached key/value business settings.
 * All settings are JSON-typed. Defaults defined here, overridable via admin API.
 * Cache TTL: 60 seconds per key.
 */
import { prisma } from '../../shared/db/prisma.js';
import { redis } from '../../shared/db/redis.js';

const CACHE_TTL = 60; // seconds

export const SETTING_DEFAULTS = {
  'reservation.ttlMins':                    30,
  'inventory.lowStockThresholdDefault':     3,
  'inventory.daysOfCover':                  14,
  'inventory.adjustmentApprovalCents':      500000,
  'pricing.minMarginBps':                   1500,
  'sourcing.sameDayCutoff':                 '14:00',
  'sourcing.hubProcessingMins':             45,
  'business.openTime':                      '08:00',
  'business.closeTime':                     '18:00',
  'business.workingDays':                   [1, 2, 3, 4, 5, 6], // Mon-Sat
  'delivery.freeThresholdCents':            500000,
  'delivery.proofMode':                     'PHOTO',
  'deposit.percentBps':                     3000,
  'deposit.walkInPercentBps':               3000,
  'deposit.minSourcedValueCents':           500000,
  'cod.maxOrderCents':                      2000000,
  'procurement.confirmTimeoutMins':         30,
  'procurement.collectionTimeoutMins':      90,
  'logistics.maxConcurrentJobs':            3,
  'logistics.payoutSchedule':               'DAILY',
  'logistics.defaultCollectionFeeCents':    20000,
  'pos.discountApprovalThresholdBps':       1000,
  'pos.varianceAlertCents':                 50000,
  'cancellation.sourcedRestockingFeeBps':   0,
  'partRequest.quoteValidityHours':         48,
  'partRequest.searchTimeoutHours':         24,
};

/**
 * Get a setting value (Redis cache → DB → hardcoded default).
 * @param {string} key
 * @returns {Promise<any>}
 */
export async function getSetting(key) {
  const cacheKey = `setting:${key}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached !== null) {
    try { return JSON.parse(cached); } catch { return cached; }
  }

  const row = await prisma.setting.findUnique({ where: { key } }).catch(() => null);
  if (row) {
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(row.value)).catch(() => {});
    return row.value;
  }

  const def = SETTING_DEFAULTS[key];
  if (def !== undefined) {
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(def)).catch(() => {});
    return def;
  }

  return null;
}

/**
 * Update a setting value (requires settings:manage permission).
 */
export async function updateSetting(key, value, actor) {
  if (!(key in SETTING_DEFAULTS)) {
    throw new Error(`Unknown setting key: ${key}`);
  }

  const row = await prisma.setting.upsert({
    where: { key },
    update: { value, updatedById: actor?.userId || null },
    create: { key, value, updatedById: actor?.userId || null },
  });

  await redis.del(`setting:${key}`).catch(() => {});
  return row;
}

/**
 * List all settings (with their current values and defaults).
 */
export async function listSettings() {
  const rows = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
  const rowMap = Object.fromEntries(rows.map(r => [r.key, r.value]));

  return Object.entries(SETTING_DEFAULTS).map(([key, defaultValue]) => ({
    key,
    value: rowMap[key] !== undefined ? rowMap[key] : defaultValue,
    isCustom: rowMap[key] !== undefined,
  }));
}

/**
 * Get multiple settings at once.
 * @param {string[]} keys
 * @returns {Promise<Record<string, any>>}
 */
export async function getSettings(keys) {
  const result = {};
  await Promise.all(keys.map(async k => { result[k] = await getSetting(k); }));
  return result;
}
