/**
 * Central registry of all domain event types.
 * Outbox events, BullMQ jobs, and Socket.IO messages all use these constants.
 * Never use inline event-name strings elsewhere.
 */
export const EVENTS = {
  // Orders
  ORDER_CREATED:          'order.created',
  ORDER_PLACED:           'order.placed',
  ORDER_STATUS_CHANGED:   'order.status_changed',
  ORDER_CANCELLED:        'order.cancelled',
  ORDER_DELIVERED:        'order.delivered',
  ORDER_COMPLETED:        'order.completed',

  // Payments
  PAYMENT_INITIATED:      'payment.initiated',
  PAYMENT_SUCCEEDED:      'payment.succeeded',
  PAYMENT_FAILED:         'payment.failed',
  REFUND_SUCCEEDED:       'refund.succeeded',

  // Inventory
  INVENTORY_CHANGED:      'inventory.changed',
  INVENTORY_LOW_STOCK:    'inventory.low_stock',

  // Products / Catalogue
  PRODUCT_CREATED:        'product.created',
  PRODUCT_UPDATED:        'product.updated',
  PRODUCT_PRICE_CHANGED:  'product.price_changed',

  // Procurement
  PO_CREATED:             'po.created',
  PO_SENT:                'po.sent',
  PO_CONFIRMED:           'po.confirmed',
  PO_REJECTED:            'po.rejected',
  PO_RECEIVED:            'po.received',
  PO_PAID:                'po.paid',
  GRN_COMPLETED:          'grn.completed',
  GRN_FAILED:             'grn.failed',

  // Logistics
  JOB_CREATED:            'job.created',
  JOB_ASSIGNED:           'job.assigned',
  JOB_STATUS_CHANGED:     'job.status_changed',
  JOB_COMPLETED:          'job.completed',
  COD_COLLECTED:          'cod.collected',
  COD_RECONCILED:         'cod.reconciled',
  COD_DISCREPANCY:        'cod.discrepancy',

  // Riders / Payouts
  RIDER_APPROVED:         'rider.approved',
  PAYOUT_SUCCEEDED:       'payout.succeeded',

  // POS
  POS_SALE_COMPLETED:     'pos.sale_completed',
  POS_SHIFT_CLOSED:       'pos.shift_closed',

  // Part requests (Phase 2)
  PART_REQUEST_CREATED:   'part_request.created',
  PART_REQUEST_QUOTED:    'part_request.quoted',
  PART_REQUEST_ACCEPTED:  'part_request.accepted',

  // Users
  USER_REGISTERED:        'user.registered',

  // Alerts
  ALERT_RAISED:           'alert.raised',
};

export default EVENTS;
