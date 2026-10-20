import type { OrderStatus } from '@prisma/client';
import { defineMachine } from '../../shared/state-machine/state-machine';

// Allowed order status changes (build guide §9.1).
export const orderMachine = defineMachine<OrderStatus>('Order', {
  PENDING_PAYMENT: ['PLACED', 'CANCELLED'],
  PLACED: ['CONFIRMED', 'CANCELLED', 'COMPLETED'], // COMPLETED = walk-in counter sale
  CONFIRMED: ['SOURCING', 'PICKING', 'CANCELLED'],
  SOURCING: ['PICKING', 'CANCELLED'],
  PICKING: ['PACKED', 'CANCELLED'],
  PACKED: ['DISPATCHED', 'READY_FOR_COLLECTION', 'COMPLETED'],
  READY_FOR_COLLECTION: ['COMPLETED', 'DISPATCHED'],
  DISPATCHED: ['DELIVERED', 'PACKED'], // PACKED = delivery failed, back at hub
  DELIVERED: ['COMPLETED', 'RETURNED'],
  COMPLETED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
});

/** What the customer sees in their order timeline. Never put supplier details here (BR-007). */
export const CUSTOMER_STATUS_TEXT: Partial<Record<OrderStatus, string>> = {
  PENDING_PAYMENT: 'Order received — waiting for payment',
  PLACED: 'Order placed — thank you!',
  CONFIRMED: 'Order confirmed',
  SOURCING: 'MySpares is sourcing your part',
  PICKING: 'Your order is being prepared',
  PACKED: 'Your order is packed and will be dispatched shortly',
  READY_FOR_COLLECTION: 'Ready for collection at the MySpares shop',
  DISPATCHED: 'Out for delivery',
  DELIVERED: 'Delivered — enjoy!',
  COMPLETED: 'Completed',
  CANCELLED: 'Order cancelled',
};
