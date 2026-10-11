/**
 * Availability engine — pure domain logic for the 5-status availability algorithm.
 * §8.1 of the backend guide.
 *
 * Statuses:
 *   AVAILABLE          — available > lowStockThreshold
 *   LOW_STOCK          — 1..lowStockThreshold available units
 *   AVAILABLE_TO_ORDER — 0 available, but sourceable; returns leadTimeMins + readyBy
 *   PRE_ORDER          — 0 available, open restock PO with expected date
 *   RARE_PART_REQUEST  — not sourceable, no restock PO
 */
import { computeReadyBy } from '../../shared/time/index.js';

/**
 * Compute availability for a product.
 *
 * @param {{
 *   product: { id:string, status:string, lowStockThreshold:number, isSourceable:boolean, sourcingLeadTimeMins?:number },
 *   inventoryLevels: Array<{ onHand:number, reserved:number }>,
 *   supplierCandidates: Array<{ availability:string, supplier:{ typicalLeadTimeMins:number } }>,
 *   openRestockPo: { expectedDate?:Date } | null,
 *   settings: { sameDayCutoff:string, hubProcessingMins:number, deliveryWindowMins?:number },
 *   now?: Date
 * }} ctx
 * @returns Availability object
 */
export function computeAvailability(ctx) {
  const {
    product,
    inventoryLevels = [],
    supplierCandidates = [],
    openRestockPo = null,
    settings,
    now = new Date(),
  } = ctx;

  // Product must be ACTIVE to be purchasable
  if (product.status !== 'ACTIVE') {
    return { status: 'INACTIVE' };
  }

  // available = Σ (on_hand − reserved) across sellable locations
  const available = inventoryLevels.reduce((sum, il) => sum + Math.max(0, il.onHand - il.reserved), 0);

  // ── In stock ──────────────────────────────────────────────────────────────
  if (available > product.lowStockThreshold) {
    return { status: 'AVAILABLE', available };
  }

  if (available >= 1) {
    return { status: 'LOW_STOCK', available };
  }

  // ── available = 0 from here ───────────────────────────────────────────────

  // Pre-order: open restock PO with an expected date
  if (openRestockPo?.expectedDate) {
    return { status: 'PRE_ORDER', expectedAt: openRestockPo.expectedDate };
  }

  // Available to order: at least one viable supplier candidate
  if (product.isSourceable) {
    const candidate = supplierCandidates.find(c =>
      ['IN_STOCK', 'LOW', 'UNKNOWN'].includes(c.availability) && c.supplier
    );
    if (candidate) {
      const supplierLeadMins = Math.min(
        candidate.supplier.typicalLeadTimeMins,
        product.sourcingLeadTimeMins ?? Infinity
      );
      const hubMins = settings.hubProcessingMins || 45;
      const delivMins = settings.deliveryWindowMins || 60;
      const totalMins = supplierLeadMins + hubMins + delivMins;

      const readyBy = computeReadyBy(now, totalMins, {
        sameDayCutoff: settings.sameDayCutoff || '14:00',
        openTime:      settings.openTime      || '08:00',
        closeTime:     settings.closeTime     || '18:00',
        workingDays:   settings.workingDays   || [1, 2, 3, 4, 5, 6],
      });

      return {
        status: 'AVAILABLE_TO_ORDER',
        leadTimeMins: totalMins,
        readyBy,
        supplierLeadMins,
      };
    }
  }

  // Rare — needs a part request
  return { status: 'RARE_PART_REQUEST' };
}

/**
 * Split a requested quantity into STOCK lines and SOURCED lines.
 * Returns array of { source: 'STOCK'|'SOURCED'|'PRE_ORDER', qty, availability }
 */
export function splitOrderLines(requestedQty, availability) {
  if (availability.status === 'AVAILABLE' || availability.status === 'LOW_STOCK') {
    const stockQty  = Math.min(requestedQty, availability.available);
    const sourcedQty = requestedQty - stockQty;
    const lines = [];
    if (stockQty  > 0) lines.push({ source: 'STOCK',  qty: stockQty });
    if (sourcedQty > 0) lines.push({ source: 'SOURCED', qty: sourcedQty, leadTimeMins: null }); // lead time resolved at order creation
    return lines;
  }
  if (availability.status === 'AVAILABLE_TO_ORDER') {
    return [{ source: 'SOURCED', qty: requestedQty, leadTimeMins: availability.leadTimeMins, readyBy: availability.readyBy }];
  }
  if (availability.status === 'PRE_ORDER') {
    return [{ source: 'PRE_ORDER', qty: requestedQty, expectedAt: availability.expectedAt }];
  }
  return []; // RARE_PART_REQUEST — cannot add to cart
}
