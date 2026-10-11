/**
 * Payments service — M-Pesa STK, Stripe, COD, deposits.
 * All payments are idempotent. Callbacks/webhooks deduplicated via webhook_events table.
 */
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/codes.js';
import { emitOutboxEvent } from '../../shared/events/outbox.js';
import { EVENTS } from '../../shared/events/event-types.js';
import { recordAudit } from '../audit/audit.service.js';
import { transitionOrderStatus } from '../orders/orders.service.js';
import { postOrderRevenue } from '../finance/finance.service.js';

// ── Initiate payment ───────────────────────────────────────────────────────
export async function initiatePayment({ orderId, method, kind = 'FULL', amountCents, phone, idempotencyKey, shiftId, receivedById }, actor) {
  // Idempotency
  const existing = idempotencyKey
    ? await prisma.payment.findUnique({ where: { idempotencyKey } })
    : null;
  if (existing) return existing;

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  const payment = await prisma.payment.create({
    data: {
      orderId, method, kind, state: 'INITIATED',
      amountCents, phone: phone || null,
      shiftId: shiftId || null,
      receivedById: receivedById || null,
      idempotencyKey: idempotencyKey || uuidv4(),
    },
  });

  // Cash / card terminal: confirm immediately
  if (['CASH', 'CARD_POS_TERMINAL', 'BANK_TRANSFER'].includes(method)) {
    return succeedPayment(payment.id, null, actor);
  }

  // COD: place the order without actual payment
  if (method === 'COD') {
    await prisma.payment.update({ where: { id: payment.id }, data: { state: 'PENDING' } });
    await placeOrderAfterPayment(orderId, amountCents, kind, actor);
    return payment;
  }

  // M-Pesa STK push
  if (method === 'MPESA_STK') {
    return initiateMpesaStk(payment, phone, order, actor);
  }

  // Stripe
  if (method === 'CARD_STRIPE') {
    return initiateStripe(payment, amountCents, order, actor);
  }

  return payment;
}

// ── M-Pesa STK push ────────────────────────────────────────────────────────
async function initiateMpesaStk(payment, phone, order, actor) {
  const mode = process.env.INTEGRATIONS_MODE || 'fake';
  let providerRequestId = `FAKE_${Date.now()}`;

  if (mode === 'live') {
    const mpesa = await import('../../integrations/mpesa/client.js');
    const result = await mpesa.stkPush({
      phone, amount: Math.ceil(payment.amountCents / 100),
      accountRef: order.number,
      description: `MySpares Order ${order.number}`,
    });
    providerRequestId = result.CheckoutRequestID;
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { state: 'PENDING', providerRequestId },
  });

  await emitOutboxEvent(EVENTS.PAYMENT_INITIATED, 'payment', payment.id, { paymentId: payment.id, method: 'MPESA_STK' });
  return { ...payment, state: 'PENDING', providerRequestId };
}

// ── Stripe PaymentIntent ───────────────────────────────────────────────────
async function initiateStripe(payment, amountCents, order, actor) {
  const mode = process.env.INTEGRATIONS_MODE || 'fake';
  let providerRef = `pi_fake_${Date.now()}`;
  let clientSecret = 'cs_fake';

  if (mode === 'live') {
    const stripe = (await import('stripe')).default(process.env.STRIPE_SECRET_KEY);
    const pi = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'kes',
      metadata: { orderId: order.id, paymentId: payment.id },
      idempotency_key: payment.idempotencyKey,
    });
    providerRef = pi.id;
    clientSecret = pi.client_secret;
  }

  await prisma.payment.update({ where: { id: payment.id }, data: { state: 'PENDING', providerRef } });
  return { ...payment, state: 'PENDING', clientSecret };
}

// ── Succeed a payment (called by callback/webhook or synchronous methods) ──
export async function succeedPayment(paymentId, providerRef, actor) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (payment.state === 'SUCCEEDED') return payment; // idempotent

    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: { state: 'SUCCEEDED', providerRef: providerRef || payment.providerRef, succeededAt: new Date() },
    });

    await placeOrderAfterPayment(payment.orderId, payment.amountCents, payment.kind, actor, tx);
    await emitOutboxEvent(EVENTS.PAYMENT_SUCCEEDED, 'payment', paymentId, { paymentId, orderId: payment.orderId }, tx);
    return updated;
  });
}

async function placeOrderAfterPayment(orderId, amountCents, kind, actor, tx = prisma) {
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== 'PENDING_PAYMENT') return;

  const newAmountPaid = order.amountPaidCents + amountCents;
  const newPaymentStatus = order.isCod ? 'COD_PENDING'
    : newAmountPaid >= order.totalCents ? 'PAID'
    : newAmountPaid >= order.depositRequiredCents ? 'DEPOSIT_PAID'
    : 'UNPAID';

  await tx.order.update({
    where: { id: orderId },
    data: { amountPaidCents: newAmountPaid, paymentStatus: newPaymentStatus, placedAt: new Date() },
  });

  // Lift reservation expiry
  await tx.stockReservation.updateMany({
    where: { orderItemId: { in: (await tx.orderItem.findMany({ where: { orderId }, select: { id: true } })).map(i => i.id) }, status: 'ACTIVE' },
    data: { expiresAt: null },
  });

  // Transition to PLACED
  if (newPaymentStatus !== 'UNPAID') {
    await tx.order.update({ where: { id: orderId }, data: { status: 'PLACED', version: { increment: 1 } } });
    await tx.orderStatusEvent.create({ data: { orderId, fromStatus: 'PENDING_PAYMENT', toStatus: 'PLACED', actorId: actor?.userId || null } });
    await emitOutboxEvent(EVENTS.ORDER_PLACED, 'order', orderId, { orderId }, tx);
  }
}

// ── M-Pesa callback (webhook) ──────────────────────────────────────────────
export async function handleMpesaCallback(body) {
  const externalId = body?.Body?.stkCallback?.CheckoutRequestID;
  if (!externalId) return;

  // Deduplicate
  const exists = await prisma.webhookEvent.findUnique({ where: { provider_externalId: { provider: 'MPESA', externalId } } });
  if (exists?.processedAt) return;

  await prisma.webhookEvent.upsert({
    where: { provider_externalId: { provider: 'MPESA', externalId } },
    create: { provider: 'MPESA', externalId, payload: body },
    update: { payload: body },
  });

  const resultCode = body?.Body?.stkCallback?.ResultCode;
  const payment = await prisma.payment.findUnique({ where: { providerRequestId: externalId } });
  if (!payment) return;

  if (resultCode === 0) {
    const receiptNumber = body?.Body?.stkCallback?.CallbackMetadata?.Item?.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
    const callbackAmount = body?.Body?.stkCallback?.CallbackMetadata?.Item?.find(i => i.Name === 'Amount')?.Value;

    // Verify amount matches
    if (callbackAmount && Math.abs(callbackAmount * 100 - payment.amountCents) > 100) {
      console.error('[mpesa] Amount mismatch', callbackAmount, payment.amountCents);
      return;
    }

    await succeedPayment(payment.id, receiptNumber, null);
  } else {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { state: 'FAILED', failureReason: body?.Body?.stkCallback?.ResultDesc, rawCallback: body },
    });
    await emitOutboxEvent(EVENTS.PAYMENT_FAILED, 'payment', payment.id, { paymentId: payment.id });
  }

  await prisma.webhookEvent.update({ where: { provider_externalId: { provider: 'MPESA', externalId } }, data: { processedAt: new Date() } });
}

// ── Stripe webhook ─────────────────────────────────────────────────────────
export async function handleStripeWebhook(rawBody, signature) {
  const mode = process.env.INTEGRATIONS_MODE || 'fake';
  let event;

  if (mode === 'live') {
    const stripe = (await import('stripe')).default(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } else {
    event = JSON.parse(rawBody.toString());
  }

  const externalId = event.id || `fake_${Date.now()}`;

  const exists = await prisma.webhookEvent.findUnique({ where: { provider_externalId: { provider: 'STRIPE', externalId } } });
  if (exists?.processedAt) return;

  await prisma.webhookEvent.upsert({
    where: { provider_externalId: { provider: 'STRIPE', externalId } },
    create: { provider: 'STRIPE', externalId, payload: event },
    update: {},
  });

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const payment = await prisma.payment.findFirst({ where: { providerRef: pi.id } });
    if (payment) await succeedPayment(payment.id, pi.id, null);
  }

  await prisma.webhookEvent.update({ where: { provider_externalId: { provider: 'STRIPE', externalId } }, data: { processedAt: new Date() } });
}
