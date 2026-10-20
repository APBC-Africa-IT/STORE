import type { OrderWithItems } from './orders.service';
import type { StaffOrder } from './fulfilment.service';
import { orderMargin } from './order.domain';

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

// ───────────── Staff view ─────────────

export function toStaffOrderRow(o: { number: string; channel: string; status: string; paymentStatus: string; deliveryMethod: string; contactName: string; contactPhone: string; totalCents: number; amountPaidCents: number; promisedBy: Date | null; createdAt: Date; items: Array<{ quantity: number; source: string }> }) {
  return {
    number: o.number,
    channel: o.channel,
    status: o.status,
    paymentStatus: o.paymentStatus,
    deliveryMethod: o.deliveryMethod,
    customer: { name: o.contactName, phone: o.contactPhone },
    itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
    source: o.items.some((i) => i.source === 'SOURCED') ? 'SOURCED' : 'STOCK',
    totalCents: o.totalCents,
    balanceDueCents: Math.max(o.totalCents - o.amountPaidCents, 0),
    promisedBy: o.promisedBy,
    createdAt: o.createdAt,
  };
}

/** Full staff view. Costs and margin only with `pricing:view_cost`. */
export function toStaffOrder(o: StaffOrder, bins: Map<string, string>, canViewCost: boolean) {
  return {
    ...toCustomerOrder(o),
    id: o.id,
    channel: o.channel,
    customerId: o.customerId,
    paymentDueBy: o.paymentDueBy,
    packedAt: o.packedAt,
    completedAt: o.completedAt,
    cancelledReason: o.cancelledReason,
    items: o.items.map((i) => ({
      id: i.id, productId: i.productId, sku: i.sku, name: i.name, quantity: i.quantity,
      unitPriceCents: i.unitPriceCents, lineTotalCents: i.lineTotalCents,
      source: i.source, sourcingStatus: i.sourcingStatus, readyBy: i.readyBy,
      bin: bins.get(i.productId) ?? null,
      ...(canViewCost ? { unitCostCents: i.unitCostCents } : {}),
    })),
    payments: o.payments.map((p) => ({
      id: p.id, method: p.method, kind: p.kind, state: p.state, amountCents: p.amountCents,
      reference: p.providerRef, failureReason: p.failureReason, createdAt: p.createdAt,
    })),
    history: o.statusHistory.map((e) => ({ from: e.fromStatus, to: e.toStatus, actorId: e.actorId, note: e.note, at: e.createdAt })),
    notes: o.notes.map((n) => ({ authorId: n.authorId, body: n.body, at: n.createdAt })),
    ...(canViewCost ? { margin: orderMargin(o.items) } : {}),
  };
}
