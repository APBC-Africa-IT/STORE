/**
 * Pricing domain — pure functions for all price/VAT/margin calculations.
 * §8.3 of the backend guide. No I/O — these are 100% unit-testable.
 *
 * Rules:
 * - Retail prices are VAT-INCLUSIVE (Kenyan B2C norm)
 * - Costs are VAT-EXCLUSIVE
 * - Money is always integer cents (KES × 100)
 * - Percentages are basis points (1600 = 16.00%)
 * - roundHalfUp used throughout
 */

/** Round half-up to nearest integer */
function roundHalfUp(n) {
  return Math.floor(n + 0.5);
}

// ── VAT helpers ────────────────────────────────────────────────────────────

/**
 * Extract VAT portion from a VAT-inclusive price (per-line rounding).
 * vat = total × rate / (10000 + rate)
 */
export function vatFromInclusive(totalCents, vatRateBps) {
  return roundHalfUp((totalCents * vatRateBps) / (10000 + vatRateBps));
}

/**
 * Extract net-of-VAT portion from a VAT-inclusive price.
 */
export function netFromInclusive(totalCents, vatRateBps) {
  return totalCents - vatFromInclusive(totalCents, vatRateBps);
}

/**
 * Add VAT to a net price to get a VAT-inclusive price.
 */
export function addVat(netCents, vatRateBps) {
  return netCents + roundHalfUp(netCents * vatRateBps / 10000);
}

// ── Margin math ────────────────────────────────────────────────────────────

/**
 * Compute gross margin in basis points.
 * Margin is computed on NET-of-VAT selling price vs landed cost (both VAT-exclusive).
 */
export function marginBps(netSellPriceCents, landedCostCents) {
  if (netSellPriceCents <= 0) return 0;
  return roundHalfUp((netSellPriceCents - landedCostCents) / netSellPriceCents * 10000);
}

// ── Landed cost ────────────────────────────────────────────────────────────

/**
 * Compute landed cost per unit after allocating PO-level fees proportionally.
 *
 * landedPerUnit = unitCost + (collectionFee + otherCosts) × (lineValue / poTotal) / acceptedQty
 */
export function computeLandedCostPerUnit({ unitCostCents, acceptedQty, lineValueCents, poTotalCents, collectionFeeCents, otherCostsCents }) {
  if (acceptedQty <= 0) return 0;
  const allocatedFee = poTotalCents > 0
    ? roundHalfUp((collectionFeeCents + otherCostsCents) * lineValueCents / poTotalCents)
    : 0;
  return roundHalfUp((unitCostCents * acceptedQty + allocatedFee) / acceptedQty);
}

/**
 * Update weighted average cost.
 * newAvg = (currentAvg × currentOnHand + landedCostPerUnit × receivedQty) / (currentOnHand + receivedQty)
 */
export function updateWeightedAvgCost({ currentAvgCostCents, currentOnHand, landedCostPerUnit, receivedQty }) {
  const totalUnits = currentOnHand + receivedQty;
  if (totalUnits <= 0) return landedCostPerUnit;
  return roundHalfUp(
    (currentAvgCostCents * currentOnHand + landedCostPerUnit * receivedQty) / totalUnits
  );
}

// ── Effective price ────────────────────────────────────────────────────────

/**
 * Compute the effective selling price for a buyer context.
 * Applies sale window, trade tier, and bulk pricing (lowest wins).
 *
 * @param {{
 *   product: { retailPriceCents, salePriceCents?, saleStartsAt?, saleEndsAt?, tradePriceCents?, vatRateBps },
 *   customerTier?: string,
 *   quantity?: number,
 *   tradeTierPrices?: Array<{ tier:string, priceCents:number }>,
 *   bulkTiers?: Array<{ minQty:number, priceCents:number }>,
 *   now?: Date
 * }} ctx
 * @returns {{ priceCents:number, vatCents:number, netCents:number }}
 */
export function computeEffectivePrice(ctx) {
  const { product, customerTier = 'RETAIL', quantity = 1, tradeTierPrices = [], bulkTiers = [], now = new Date() } = ctx;

  let price = product.retailPriceCents;

  // Sale window
  if (
    product.salePriceCents &&
    product.saleStartsAt && product.saleEndsAt &&
    now >= new Date(product.saleStartsAt) &&
    now <= new Date(product.saleEndsAt)
  ) {
    price = Math.min(price, product.salePriceCents);
  }

  // Trade tier price (Phase 2: use tradeTierPrices; Phase 1: use tradePriceCents)
  if (customerTier !== 'RETAIL') {
    const tierMatch = tradeTierPrices.find(t => t.tier === customerTier);
    if (tierMatch) {
      price = Math.min(price, tierMatch.priceCents);
    } else if (product.tradePriceCents) {
      price = Math.min(price, product.tradePriceCents);
    }
  }

  // Bulk tier
  if (quantity > 1 && bulkTiers.length > 0) {
    const applicable = bulkTiers
      .filter(t => quantity >= t.minQty)
      .sort((a, b) => b.minQty - a.minQty);
    if (applicable.length > 0) {
      price = Math.min(price, applicable[0].priceCents);
    }
  }

  const vatCents = vatFromInclusive(price, product.vatRateBps);
  return {
    priceCents:  price,
    vatCents,
    netCents:    price - vatCents,
  };
}

// ── Margin floor check ─────────────────────────────────────────────────────

/**
 * Check if a price meets the margin floor.
 * @returns {{ result: 'OK'|'WARN_BELOW_MARGIN'|'BLOCK_BELOW_COST', marginBps: number }}
 */
export function checkPriceFloor({ sellingPriceCents, landedCostCents, vatRateBps, minMarginBps }) {
  const netPrice = netFromInclusive(sellingPriceCents, vatRateBps);
  const mBps = marginBps(netPrice, landedCostCents);

  if (netPrice <= landedCostCents) {
    return { result: 'BLOCK_BELOW_COST', marginBps: mBps };
  }
  if (mBps < minMarginBps) {
    return { result: 'WARN_BELOW_MARGIN', marginBps: mBps };
  }
  return { result: 'OK', marginBps: mBps };
}

// ── Order-level totals ────────────────────────────────────────────────────

/**
 * Compute totals for a list of order lines.
 * @param {Array<{ unitPriceCents:number, vatRateBps:number, quantity:number }>} lines
 * @param {{ deliveryFeeCents?:number, deliveryVatRateBps?:number, discountCents?:number }} extra
 */
export function computeOrderTotals(lines, extra = {}) {
  const { deliveryFeeCents = 0, deliveryVatRateBps = 1600, discountCents = 0 } = extra;

  let subtotalCents = 0;
  let vatCents = 0;

  for (const line of lines) {
    const lineTotal = line.unitPriceCents * line.quantity;
    subtotalCents += lineTotal;
    vatCents += vatFromInclusive(lineTotal, line.vatRateBps);
  }

  // Delivery VAT
  vatCents += vatFromInclusive(deliveryFeeCents, deliveryVatRateBps);

  const totalCents = subtotalCents + deliveryFeeCents - discountCents;
  return {
    subtotalCents,
    deliveryFeeCents,
    discountCents,
    vatCents,
    totalCents: Math.max(0, totalCents),
  };
}

// ── Deposit calculation ────────────────────────────────────────────────────

/**
 * Compute the deposit required for a sourced order.
 * Rounds up to nearest shilling (100 cents).
 */
export function computeDeposit(totalCents, depositPercentBps) {
  const raw = roundHalfUp(totalCents * depositPercentBps / 10000);
  // Round up to nearest 100 cents (1 KES)
  return Math.ceil(raw / 100) * 100;
}
