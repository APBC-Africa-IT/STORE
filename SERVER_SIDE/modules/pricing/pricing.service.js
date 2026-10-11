/**
 * Pricing service (§8.3).
 * All money in integer cents. Percentages in basis points.
 * Retail prices are VAT-inclusive. Costs are VAT-exclusive.
 */
import { prisma } from '../../shared/db/prisma.js';
import { redis } from '../../shared/db/redis.js';
import { vatFromInclusive, netFromInclusive, checkPriceFloor, marginBps } from '../../shared/money/index.js';

const DEFAULT_VAT_BPS = 1600; // 16%

// ── Settings cache ─────────────────────────────────────────────────────────
async function getSettingCached(key, def) {
  const cacheKey = `setting:${key}`;
  const cached = await redis.get(cacheKey);
  if (cached !== null) return JSON.parse(cached);
  const row = await prisma.setting.findUnique({ where: { key } });
  const val = row ? row.value : def;
  await redis.setex(cacheKey, 60, JSON.stringify(val));
  return val;
}

// ── Effective price for a buyer ────────────────────────────────────────────
/**
 * Returns the best (lowest) applicable price for a given buyer context.
 * All returned prices are VAT-inclusive cents.
 */
export async function getEffectivePrice(productId, { customerTier = 'RETAIL', quantity = 1 } = {}) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return null;

  const now = new Date();
  let price = product.retailPriceCents;

  // Sale price (if window active)
  if (product.salePriceCents && product.saleStartsAt <= now && (!product.saleEndsAt || product.saleEndsAt >= now)) {
    price = Math.min(price, product.salePriceCents);
  }

  // Trade price
  if (['TRADE_CUSTOMER', 'TRADE_BRONZE', 'TRADE_SILVER', 'TRADE_GOLD'].includes(customerTier)) {
    if (product.tradePriceCents) price = Math.min(price, product.tradePriceCents);
  }

  return price;
}

// ── VAT breakdown for a line ────────────────────────────────────────────────
export function getPriceBreakdown(inclusivePriceCents, vatRateBps = DEFAULT_VAT_BPS, quantity = 1) {
  const lineTotal   = inclusivePriceCents * quantity;
  const vatCents    = vatFromInclusive(lineTotal, vatRateBps);
  const netCents    = lineTotal - vatCents;
  return { unitPriceCents: inclusivePriceCents, lineTotal, vatCents, netCents, vatRateBps };
}

// ── Margin floor check ─────────────────────────────────────────────────────
/**
 * Check whether a proposed retail price passes the margin floor.
 * Returns: { result: 'OK'|'WARN_BELOW_MARGIN'|'BLOCK_BELOW_COST', marginBps, landedCost }
 */
export async function checkMarginFloor(productId, proposedPriceCents) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error('Product not found');

  const globalMinMarginBps = await getSettingCached('pricing.minMarginBps', 1500);
  const minMarginBps = product.minMarginBps ?? globalMinMarginBps;
  const landedCost   = product.avgCostCents ?? product.lastCostCents ?? null;

  const netPrice = netFromInclusive(proposedPriceCents, product.vatRateBps ?? DEFAULT_VAT_BPS);
  const result   = checkPriceFloor(netPrice, landedCost, minMarginBps);
  const margin   = landedCost ? marginBps(netPrice, landedCost) : null;

  return { result, marginBps: margin, landedCostCents: landedCost, netPriceCents: netPrice };
}

// ── Delivery fee ───────────────────────────────────────────────────────────
export async function getDeliveryFee(zoneId, orderSubtotalCents, expressUpgrade = false) {
  const freeThreshold = await getSettingCached('delivery.freeThresholdCents', 0);

  if (freeThreshold > 0 && orderSubtotalCents >= freeThreshold) return 0;

  if (!zoneId) return 0;
  const zone = await prisma.deliveryZone.findUnique({ where: { id: zoneId } });
  if (!zone || !zone.isActive) return 0;

  let fee = zone.customerFeeCents;
  if (expressUpgrade) fee += zone.expressSurchargeCents;
  return fee;
}
