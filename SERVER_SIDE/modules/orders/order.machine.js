/**
 * Order state machine (§9.1).
 * All order status changes MUST go through this machine.
 */
import { defineMachine } from '../../shared/state-machine/index.js';

export const orderMachine = defineMachine('Order', {
  PENDING_PAYMENT:      ['PLACED', 'CANCELLED'],
  PLACED:               ['CONFIRMED', 'CANCELLED', 'COMPLETED'],
  CONFIRMED:            ['SOURCING', 'PICKING', 'CANCELLED'],
  SOURCING:             ['PICKING', 'CANCELLED'],
  PICKING:              ['PACKED', 'CANCELLED'],
  PACKED:               ['DISPATCHED', 'READY_FOR_COLLECTION', 'COMPLETED'],
  READY_FOR_COLLECTION: ['COMPLETED', 'DISPATCHED'],
  DISPATCHED:           ['DELIVERED', 'PACKED'],
  DELIVERED:            ['COMPLETED', 'RETURNED'],
  COMPLETED:            ['RETURNED'],
  CANCELLED:            [],
  RETURNED:             [],
}, {
  // → PLACED requires payment captured or COD accepted (BR-001)
  'PENDING_PAYMENT->PLACED': (ctx) => {
    if (ctx.amountPaidCents < ctx.depositRequiredCents && !ctx.isCod) {
      return 'Payment required before placing order';
    }
    return null;
  },
  // → PICKING requires all sourced items RECEIVED (BR-012)
  'SOURCING->PICKING': (ctx) => {
    if (ctx.hasUnreceivedSourcedItems) return 'All sourced items must be received before picking';
    return null;
  },
  // → DISPATCHED requires a delivery job
  'PACKED->DISPATCHED': (ctx) => {
    if (!ctx.hasDeliveryJob) return 'A delivery job must be assigned before dispatching';
    return null;
  },
  // → COMPLETED requires full payment
  'DELIVERED->COMPLETED': (ctx) => {
    if (ctx.amountPaidCents < ctx.totalCents) return 'Balance must be settled before completing';
    return null;
  },
});
