// Pure pricing rules — no database, no HTTP. Easy to unit-test.

export const DEFAULT_MIN_MARGIN_BPS = 1500; // 15% (moves to business settings later)

type Priced = {
  retailPriceCents: number;
  salePriceCents: number | null;
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
};

export function isSaleActive(p: Priced, now = new Date()): boolean {
  if (p.salePriceCents == null) return false;
  if (p.saleStartsAt && now < p.saleStartsAt) return false;
  if (p.saleEndsAt && now > p.saleEndsAt) return false;
  return true;
}

/** What a retail customer pays right now (VAT-inclusive). */
export function effectiveRetailPrice(p: Priced, now = new Date()): number {
  return isSaleActive(p, now) ? (p.salePriceCents as number) : p.retailPriceCents;
}

/** VAT contained in a VAT-inclusive amount. 16% → price × 1600 / 11600. Rounded half-up. */
export function vatPortion(grossCents: number, vatRateBps: number): number {
  return Math.round((grossCents * vatRateBps) / (10_000 + vatRateBps));
}

export function netOfVat(grossCents: number, vatRateBps: number): number {
  return grossCents - vatPortion(grossCents, vatRateBps);
}

export type PriceFloorResult = 'OK' | 'WARN_BELOW_MARGIN' | 'BLOCK_BELOW_COST';

/**
 * BR-004: never sell below cost without Finance approval; warn below the margin floor.
 * Compares the NET (ex-VAT) selling price against cost (costs are ex-VAT).
 */
export function checkPriceFloor(args: {
  sellingPriceCents: number; // VAT-inclusive
  vatRateBps: number;
  costCents: number | null;
  minMarginBps?: number | null;
}): PriceFloorResult {
  if (args.costCents == null) return 'OK'; // no cost known yet
  const net = netOfVat(args.sellingPriceCents, args.vatRateBps);
  if (net < args.costCents) return 'BLOCK_BELOW_COST';
  const marginBps = net === 0 ? 0 : Math.floor(((net - args.costCents) * 10_000) / net);
  if (marginBps < (args.minMarginBps ?? DEFAULT_MIN_MARGIN_BPS)) return 'WARN_BELOW_MARGIN';
  return 'OK';
}
