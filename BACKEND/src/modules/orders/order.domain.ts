import type { ItemSource, ItemSourcingStatus, OrderStatus } from '@prisma/client';

/**
 * After an order is confirmed: if any part still has to come from a supplier,
 * it waits in SOURCING; otherwise it goes straight to the picking queue.
 */
export function routeAfterConfirm(items: Array<{ source: ItemSource; sourcingStatus: ItemSourcingStatus }>): OrderStatus {
  const waitingForSupplier = items.some((i) => i.source === 'SOURCED' && i.sourcingStatus !== 'RECEIVED');
  return waitingForSupplier ? 'SOURCING' : 'PICKING';
}

/** Gross margin on an order (ex-VAT revenue minus cost). Null until every line has a cost. */
export function orderMargin(items: Array<{ quantity: number; lineTotalCents: number; vatCents: number; unitCostCents: number | null }>) {
  if (items.some((i) => i.unitCostCents == null)) return null;
  const netRevenue = items.reduce((s, i) => s + i.lineTotalCents - i.vatCents, 0);
  const cost = items.reduce((s, i) => s + (i.unitCostCents as number) * i.quantity, 0);
  const margin = netRevenue - cost;
  return { netRevenueCents: netRevenue, costCents: cost, marginCents: margin, marginBps: netRevenue ? Math.floor((margin * 10_000) / netRevenue) : 0 };
}
