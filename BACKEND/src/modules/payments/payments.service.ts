import { Prisma, type Order, type Payment, type PaymentKind, type PrismaClient } from '@prisma/client';
import { config } from '../../config/config';
import { AppError } from '../../shared/errors/app-error';
import { emitEvent } from '../../shared/events/outbox';
import type { MpesaClient } from '../../integrations/mpesa';
import { accountReference, centsToShillings, parseStkCallback, stkFailureReason } from '../../integrations/mpesa/mpesa.helpers';
import type { OrdersService } from '../orders/orders.service';

type Tx = Prisma.TransactionClient;
const OPEN_STATES = ['INITIATED', 'PENDING'] as const;

export class PaymentsService {
  constructor(
    private readonly db: PrismaClient,
    private readonly orders: OrdersService,
    private readonly mpesa: MpesaClient,
  ) {}

  /** How much the customer should pay next on this order. */
  amountDue(order: Pick<Order, 'paymentPlan' | 'paymentStatus' | 'totalCents' | 'depositRequiredCents' | 'amountPaidCents'>): { kind: PaymentKind; amountCents: number } {
    if (order.paymentPlan === 'COD') throw new AppError('VALIDATION_FAILED', 'This is a cash-on-delivery order');
    if (order.paymentStatus === 'UNPAID') {
      return order.paymentPlan === 'DEPOSIT'
        ? { kind: 'DEPOSIT', amountCents: order.depositRequiredCents }
        : { kind: 'FULL', amountCents: order.totalCents };
    }
    if (order.paymentStatus === 'DEPOSIT_PAID') return { kind: 'BALANCE', amountCents: order.totalCents - order.amountPaidCents };
    throw new AppError('CONFLICT', 'This order is already paid');
  }

  // ═════════════ 1. Start an M-Pesa STK push ═════════════

  async startMpesa(input: {
    orderNumber: string;
    phone: string; // E.164, the phone that will get the PIN prompt
    idempotencyKey: string;
    requester: { userId: string | null; contactPhone: string | null };
  }) {
    const order = await this.db.order.findUnique({ where: { number: input.orderNumber } });
    // Owner (logged in) or anyone who knows the order number AND the checkout phone.
    const allowed = order && (order.customerId ? order.customerId === input.requester.userId : order.contactPhone === input.requester.contactPhone);
    if (!order || !allowed) throw new AppError('NOT_FOUND', 'Order not found');
    if (order.status === 'CANCELLED') throw new AppError('CONFLICT', 'This order was cancelled');
    if (order.status === 'PENDING_PAYMENT' && order.paymentDueBy && order.paymentDueBy < new Date()) {
      throw new AppError('RESERVATION_EXPIRED', 'The payment window for this order has closed. Please order again.');
    }

    const byKey = await this.db.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (byKey) return { payment: byKey, alreadyInProgress: true };

    // Only one open STK push per order (also enforced by a unique index in the database).
    const open = await this.db.payment.findFirst({ where: { orderId: order.id, state: { in: [...OPEN_STATES] } } });
    if (open) return { payment: open, alreadyInProgress: true };

    const due = this.amountDue(order);
    let payment: Payment;
    try {
      payment = await this.db.payment.create({
        data: {
          orderId: order.id, method: 'MPESA_STK', kind: due.kind, amountCents: due.amountCents,
          phone: input.phone, idempotencyKey: input.idempotencyKey,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.db.payment.findFirst({
          where: { OR: [{ idempotencyKey: input.idempotencyKey }, { orderId: order.id, state: { in: [...OPEN_STATES] } }] },
        });
        if (existing) return { payment: existing, alreadyInProgress: true };
      }
      throw err;
    }

    // Call Safaricom OUTSIDE any database transaction (never hold a DB connection while waiting on the network).
    try {
      const push = await this.mpesa.stkPush({
        amountShillings: centsToShillings(due.amountCents),
        phone: input.phone,
        accountReference: accountReference(order.number),
        description: 'MySpares',
        callbackUrl: `${config.PUBLIC_API_BASE_URL}/api/v1/webhooks/mpesa/stk/${config.MPESA_CALLBACK_SECRET}`,
      });
      payment = await this.db.payment.update({
        where: { id: payment.id },
        data: { state: 'PENDING', providerRequestId: push.checkoutRequestId, merchantRequestId: push.merchantRequestId },
      });
      return { payment, alreadyInProgress: false };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'M-Pesa request failed';
      await this.db.payment.update({ where: { id: payment.id }, data: { state: 'FAILED', failureReason: reason } });
      throw new AppError('PAYMENT_FAILED', `Could not start M-Pesa payment: ${reason}`);
    }
  }

  // ═════════════ 2. Safaricom calls us back ═════════════

  /** Store the callback first (never lose one), then process it. Duplicates are ignored. */
  async handleMpesaCallback(body: unknown) {
    const cb = parseStkCallback(body); // throws on garbage
    let event;
    try {
      event = await this.db.webhookEvent.create({
        data: { provider: 'MPESA', externalId: cb.checkoutRequestId, payload: body as Prisma.InputJsonValue },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return { duplicate: true };
      throw err;
    }
    await this.safeProcessEvent(event.id);
    return { duplicate: false };
  }

  /** Never throws: failures are recorded and the reconcile job retries them. */
  async safeProcessEvent(eventId: string) {
    try {
      await this.processMpesaEvent(eventId);
    } catch (err) {
      await this.db.webhookEvent.update({
        where: { id: eventId },
        data: { attempts: { increment: 1 }, error: err instanceof Error ? err.message.slice(0, 500) : 'unknown error' },
      });
    }
  }

  private async processMpesaEvent(eventId: string) {
    const event = await this.db.webhookEvent.findUniqueOrThrow({ where: { id: eventId } });
    if (event.processedAt) return;
    const cb = parseStkCallback(event.payload);
    const done = (error: string | null = null) =>
      this.db.webhookEvent.update({ where: { id: eventId }, data: { processedAt: new Date(), error, attempts: { increment: 1 } } });

    const payment = await this.db.payment.findUnique({ where: { providerRequestId: cb.checkoutRequestId } });
    if (!payment) return done('UNKNOWN_CHECKOUT_REQUEST');

    if (cb.resultCode === '0') {
      // Callbacks can be faked by anyone who finds the URL → confirm with Safaricom before trusting it.
      const check = await this.mpesa.stkQuery(cb.checkoutRequestId);
      if (check.status === 'PROCESSING') throw new Error('Safaricom still processing; will retry');
      if (check.resultCode !== '0') {
        await emitEvent(this.db, {
          type: 'alert.payment_verification_failed', aggregateType: 'payment', aggregateId: payment.id,
          payload: { paymentId: payment.id, callbackResult: cb.resultCode, queryResult: check.resultCode },
        });
        return done('VERIFICATION_FAILED');
      }
      if (cb.amount != null && cb.amount !== centsToShillings(payment.amountCents)) {
        await emitEvent(this.db, {
          type: 'alert.payment_amount_mismatch', aggregateType: 'payment', aggregateId: payment.id,
          payload: { paymentId: payment.id, expected: centsToShillings(payment.amountCents), callback: cb.amount },
        });
      }
      await this.markSucceeded(payment.id, { receipt: cb.receipt });
    } else {
      await this.markFailed(payment.id, cb.resultCode, cb.resultDesc);
    }
    return done();
  }

  // ═════════════ 3. Apply the result ═════════════

  /**
   * Money arrived. Idempotent: only the first call counts.
   * A real success ALWAYS wins — even over an earlier "failed"/"cancelled" — so we never lose money.
   */
  async markSucceeded(paymentId: string, opts: { receipt: string | null }) {
    return this.db.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: paymentId, state: { notIn: ['SUCCEEDED', 'REFUNDED'] } },
        data: { state: 'SUCCEEDED', resultCode: '0', failureReason: null, succeededAt: new Date(), ...(opts.receipt ? { providerRef: opts.receipt } : {}) },
      });
      if (claimed.count === 0) return false;

      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
      await this.applyToOrder(tx, order, payment);
      await emitEvent(tx, {
        type: 'payment.succeeded', aggregateType: 'payment', aggregateId: payment.id,
        payload: { paymentId: payment.id, orderId: order.id, amountCents: payment.amountCents, method: payment.method, receipt: payment.providerRef },
      });
      return true;
    });
  }

  async markFailed(paymentId: string, resultCode: string, resultDesc: string) {
    await this.db.payment.updateMany({
      where: { id: paymentId, state: { in: [...OPEN_STATES] } },
      data: { state: 'FAILED', resultCode, failureReason: stkFailureReason(resultCode, resultDesc) },
    });
  }

  private async applyToOrder(tx: Tx, order: Order, payment: Payment) {
    const paid = order.amountPaidCents + payment.amountCents;
    const paymentStatus = paid >= order.totalCents ? 'PAID' : paid >= order.depositRequiredCents && order.paymentPlan === 'DEPOSIT' ? 'DEPOSIT_PAID' : order.paymentStatus;

    if (order.status === 'PENDING_PAYMENT' && paid >= order.depositRequiredCents) {
      // BR-001: the sale is confirmed now that payment/deposit is in.
      await this.orders.transition(tx, order, 'PLACED', {
        note: `Payment ${payment.providerRef ?? payment.id}`,
        data: { amountPaidCents: paid, paymentStatus, placedAt: new Date(), paymentDueBy: null },
      });
      // Stock is now held until dispatch — remove the 30-minute expiry.
      const items = await tx.orderItem.findMany({ where: { orderId: order.id }, select: { id: true } });
      await tx.stockReservation.updateMany({
        where: { orderItemId: { in: items.map((i) => i.id) }, status: 'ACTIVE' },
        data: { expiresAt: null },
      });
      await emitEvent(tx, {
        type: 'order.placed', aggregateType: 'order', aggregateId: order.id,
        payload: { orderId: order.id, number: order.number, totalCents: order.totalCents },
      });
      return;
    }

    await tx.order.update({
      where: { id: order.id },
      data: { amountPaidCents: { increment: payment.amountCents }, paymentStatus, version: { increment: 1 } },
    });
    if (order.status === 'CANCELLED') {
      // Paid after the order expired/cancelled: a human must refund or revive it.
      await emitEvent(tx, {
        type: 'alert.payment_for_cancelled_order', aggregateType: 'order', aggregateId: order.id,
        payload: { orderId: order.id, number: order.number, paymentId: payment.id, amountCents: payment.amountCents },
      });
    }
  }

  // ═════════════ 4. Safety net (runs every minute in the worker) ═════════════

  async reconcile(now = new Date()) {
    let events = 0;
    let checked = 0;

    // a) Callbacks we stored but couldn't process (e.g. Safaricom query was down)
    const stuck = await this.db.webhookEvent.findMany({
      where: { provider: 'MPESA', processedAt: null, attempts: { lt: 10 }, createdAt: { lt: new Date(now.getTime() - 30_000) } },
      take: 50,
    });
    for (const e of stuck) {
      await this.safeProcessEvent(e.id);
      events++;
    }

    // b) Payments with no callback yet → ask Safaricom directly
    const pending = await this.db.payment.findMany({
      where: {
        method: 'MPESA_STK', state: 'PENDING', providerRequestId: { not: null }, checkAttempts: { lt: 30 },
        createdAt: { lt: new Date(now.getTime() - 60_000) },
        OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(now.getTime() - 60_000) } }],
      },
      take: 50,
    });
    for (const p of pending) {
      checked++;
      try {
        const result = await this.mpesa.stkQuery(p.providerRequestId!);
        if (result.status === 'PROCESSING') {
          await this.db.payment.update({ where: { id: p.id }, data: { lastCheckedAt: now, checkAttempts: { increment: 1 } } });
        } else if (result.resultCode === '0') {
          await this.markSucceeded(p.id, { receipt: null }); // receipt arrives later with the callback, if at all
        } else {
          await this.markFailed(p.id, result.resultCode, result.resultDesc);
        }
      } catch {
        await this.db.payment.update({ where: { id: p.id }, data: { lastCheckedAt: now, checkAttempts: { increment: 1 } } });
      }
    }
    return { events, checked };
  }

  // ═════════════ 5. Status for the checkout page (polled every few seconds) ═════════════

  async status(paymentId: string) {
    const p = await this.db.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
    if (!p) throw new AppError('NOT_FOUND', 'Payment not found');
    return {
      id: p.id,
      state: p.state,
      method: p.method,
      kind: p.kind,
      amountCents: p.amountCents,
      receipt: p.providerRef,
      failureReason: p.failureReason,
      order: {
        number: p.order.number,
        status: p.order.status,
        paymentStatus: p.order.paymentStatus,
        balanceDueCents: Math.max(p.order.totalCents - p.order.amountPaidCents, 0),
      },
    };
  }
}
