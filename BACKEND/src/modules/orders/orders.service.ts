import type { OrderStatus, Prisma, PrismaClient } from '@prisma/client';
import { AppError } from '../../shared/errors/app-error';
import { emitEvent } from '../../shared/events/outbox';
import type { InventoryService } from '../inventory/inventory.service';
import { CUSTOMER_STATUS_TEXT, orderMachine } from './order.machine';

type Tx = Prisma.TransactionClient;

export const orderInclude = {
  items: true,
  statusHistory: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;
export type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

const CUSTOMER_CANCELLABLE: OrderStatus[] = ['PENDING_PAYMENT', 'PLACED', 'CONFIRMED'];

export class OrdersService {
  constructor(
    private readonly db: PrismaClient,
    private readonly inventory: InventoryService,
  ) {}

  /**
   * THE only way an order's status changes.
   * Checks the state machine, then updates with compare-and-set on (status, version)
   * so two people changing the same order at once can't both win.
   */
  async transition(
    tx: Tx,
    order: { id: string; status: OrderStatus; version: number },
    to: OrderStatus,
    opts: { actorId?: string | null; note?: string; data?: Prisma.OrderUpdateManyMutationInput } = {},
  ) {
    orderMachine.assertTransition(order.status, to);
    const res = await tx.order.updateMany({
      where: { id: order.id, status: order.status, version: order.version },
      data: { ...opts.data, status: to, version: { increment: 1 } },
    });
    if (res.count === 0) throw new AppError('CONFLICT', 'The order was changed by someone else. Reload and try again.');

    await tx.orderStatusEvent.create({
      data: {
        orderId: order.id, fromStatus: order.status, toStatus: to, actorId: opts.actorId ?? null,
        note: opts.note ?? null, customerVisibleText: CUSTOMER_STATUS_TEXT[to] ?? null,
      },
    });
    await emitEvent(tx, {
      type: 'order.status_changed', aggregateType: 'order', aggregateId: order.id,
      payload: { orderId: order.id, from: order.status, to },
    });
  }

  async findByNumber(number: string) {
    return this.db.order.findUnique({ where: { number }, include: orderInclude });
  }

  async listForCustomer(customerId: string, limit = 20, cursor?: string) {
    return this.db.order.findMany({
      where: { customerId },
      include: orderInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  /** Customer cancels their own order (before any supplier PO is sent — checked in the sourcing step). */
  async cancelByCustomer(number: string, customerId: string, reason: string) {
    const order = await this.findByNumber(number);
    if (!order || order.customerId !== customerId) throw new AppError('NOT_FOUND', 'Order not found');
    if (!CUSTOMER_CANCELLABLE.includes(order.status)) {
      throw new AppError('INVALID_STATE_TRANSITION', 'This order can no longer be cancelled online. Please contact us.');
    }
    await this.db.$transaction((tx) => this.cancel(tx, order, { reason, actorId: customerId }));
    return this.findByNumber(number);
  }

  /** Cancels an order and gives its stock back. Refunds are handled by the payments step. */
  async cancel(tx: Tx, order: { id: string; status: OrderStatus; version: number; amountPaidCents: number }, opts: { reason: string; actorId?: string | null }) {
    await this.transition(tx, order, 'CANCELLED', {
      actorId: opts.actorId ?? null,
      note: opts.reason,
      data: { cancelledAt: new Date(), cancelledReason: opts.reason },
    });
    await this.releaseOrderStock(tx, order.id);
    await emitEvent(tx, {
      type: 'order.cancelled', aggregateType: 'order', aggregateId: order.id,
      payload: { orderId: order.id, reason: opts.reason, refundDueCents: order.amountPaidCents },
    });
  }

  /**
   * Releases stock held by orders that were never paid (runs every minute from the worker).
   * Each order is handled in its own transaction so one failure doesn't block the rest.
   */
  async expireUnpaid(now = new Date(), batchSize = 100) {
    const due = await this.db.order.findMany({
      where: { status: 'PENDING_PAYMENT', paymentDueBy: { lt: now } },
      select: { id: true, status: true, version: true, amountPaidCents: true },
      take: batchSize,
      orderBy: { paymentDueBy: 'asc' },
    });
    let expired = 0;
    for (const order of due) {
      try {
        await this.db.$transaction((tx) => this.cancel(tx, order, { reason: 'PAYMENT_TIMEOUT' }));
        expired++;
      } catch (err) {
        // CONFLICT = payment arrived at the same moment; that's fine, skip it.
        if (!(err instanceof AppError && err.code === 'CONFLICT')) throw err;
      }
    }
    return expired;
  }

  private async releaseOrderStock(tx: Tx, orderId: string) {
    const items = await tx.orderItem.findMany({ where: { orderId }, select: { id: true } });
    const reservations = await tx.stockReservation.findMany({
      where: { orderItemId: { in: items.map((i) => i.id) }, status: 'ACTIVE' },
      select: { id: true },
    });
    for (const r of reservations) await this.inventory.release(tx, r.id);
  }
}
