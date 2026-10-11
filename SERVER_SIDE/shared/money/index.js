/**
 * Money helpers — all amounts are integer cents (KES × 100).
 * Percentages stored as basis points (bps): 1600 = 16.00%.
 * NEVER use floating-point arithmetic on money.
 */

/** Round half-up — used for per-line VAT calculation */
export function roundHalfUp(n) {
  return Math.floor(n + 0.5);
}

/**
 * Extract VAT portion from a VAT-inclusive amount.
 * vatRateBps: e.g. 1600 for 16%
 * Formula: vat = round( total × rate / (10000 + rate) )
 */
export function vatFromInclusive(totalCents, vatRateBps) {
  return roundHalfUp((totalCents * vatRateBps) / (10000 + vatRateBps));
}

/**
 * Net-of-VAT amount from a VAT-inclusive amount.
 */
export function netFromInclusive(totalCents, vatRateBps) {
  return totalCents - vatFromInclusive(totalCents, vatRateBps);
}

/**
 * Add VAT to a net (exclusive) amount to get inclusive price.
 */
export function addVat(netCents, vatRateBps) {
  return roundHalfUp(netCents * (10000 + vatRateBps) / 10000);
}

/**
 * Gross margin in basis points: (net - cost) / net × 10000
 * Returns 0 if net is 0.
 */
export function marginBps(netPriceCents, landedCostCents) {
  if (netPriceCents <= 0) return 0;
  return roundHalfUp(((netPriceCents - landedCostCents) / netPriceCents) * 10000);
}

/**
 * Check if a given net price meets the margin floor.
 * Returns: 'OK' | 'WARN_BELOW_MARGIN' | 'BLOCK_BELOW_COST'
 */
export function checkPriceFloor(netPriceCents, landedCostCents, minMarginBps) {
  if (landedCostCents == null || landedCostCents <= 0) return 'OK';
  if (netPriceCents < landedCostCents) return 'BLOCK_BELOW_COST';
  if (minMarginBps != null && marginBps(netPriceCents, landedCostCents) < minMarginBps) {
    return 'WARN_BELOW_MARGIN';
  }
  return 'OK';
}

/**
 * Apply a percentage discount (bps) to an amount.
 */
export function applyDiscountBps(amountCents, discountBps) {
  return amountCents - roundHalfUp((amountCents * discountBps) / 10000);
}

/**
 * Compute landed cost per unit:
 * landed = unitCost + (collectionFee + otherCosts) × (lineValue / poValue) / acceptedQty
 */
export function computeLandedCost({ unitCostCents, collectionFeeCents, otherCostsCents, lineValue, poValue, acceptedQty }) {
  if (!acceptedQty || acceptedQty <= 0) return unitCostCents;
  const overheadPerUnit = poValue > 0
    ? roundHalfUp(((collectionFeeCents + otherCostsCents) * lineValue) / poValue / acceptedQty)
    : 0;
  return unitCostCents + overheadPerUnit;
}

/**
 * Weighted average cost update.
 * Returns new avgCostCents after receiving `qty` units at `landedCost`.
 */
export function updateWeightedAvgCost(currentAvgCents, onHandBefore, landedCostCents, qty) {
  const totalBefore = currentAvgCents * onHandBefore;
  const totalNew = landedCostCents * qty;
  const newQty = onHandBefore + qty;
  if (newQty <= 0) return landedCostCents;
  return roundHalfUp((totalBefore + totalNew) / newQty);
}

/** Convert cents to KES string for display */
export function formatKes(cents) {
  return `KES ${(cents / 100).toFixed(2)}`;
}

/** Parse KES string or number to cents */
export function toCents(value) {
  return roundHalfUp(parseFloat(value) * 100);
}
