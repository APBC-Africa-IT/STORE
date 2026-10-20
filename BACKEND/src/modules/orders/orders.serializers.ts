import type { OrderWithItems } from './orders.service';

// Customer view of an order: allow-listed fields only. No costs, no internal notes, no supplier info.
export function toCustomerOrder(o: OrderWithItems) {
  return {
    number: o.number,
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentPlan: o.paymentPlan,
    deliveryMethod: o.deliveryMethod,
    deliveryAddress: o.deliveryAddress,
    contact: { name: o.contactName, phone: o.contactPhone, email: o.contactEmail },
    items: o.items.map((i) => ({
      productId: i.productId, sku: i.sku, name: i.name, quantity: i.quantity,
      unitPriceCents: i.unitPriceCents, lineTotalCents: i.lineTotalCents,
      fulfilment: i.source === 'SOURCED' ? 'SOURCED_FOR_YOU' : 'FROM_STOCK',
      readyBy: i.readyBy,
    })),
    totals: {
      subtotalCents: o.subtotalCents,
      deliveryFeeCents: o.deliveryFeeCents,
      discountCents: o.discountCents,
      vatCents: o.vatCents,
      totalCents: o.totalCents,
      depositRequiredCents: o.depositRequiredCents,
      amountPaidCents: o.amountPaidCents,
      balanceDueCents: Math.max(o.totalCents - o.amountPaidCents, 0),
      currency: 'KES' as const,
    },
    promisedBy: o.promisedBy,
    paymentDueBy: o.status === 'PENDING_PAYMENT' ? o.paymentDueBy : null,
    timeline: o.statusHistory
      .filter((e) => e.customerVisibleText)
      .map((e) => ({ status: e.toStatus, text: e.customerVisibleText, at: e.createdAt })),
    createdAt: o.createdAt,
  };
}
