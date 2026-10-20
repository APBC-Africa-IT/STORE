import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../src/app/build-app';
import { prisma } from '../../src/shared/db/prisma';
import { redis } from '../../src/shared/redis';
import { fakeMpesa } from '../../src/integrations/mpesa';
import { FakeMpesaClient } from '../../src/integrations/mpesa/mpesa.fake';
import { inventoryService } from '../../src/modules/inventory/inventory.routes';
import { ordersService } from '../../src/modules/orders/orders.routes';
import { paymentsService } from '../../src/modules/payments/payments.routes';

const SECRET = 'test-callback-secret-0123456789';
let app: FastifyInstance;
let categoryId: string;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  categoryId = (await prisma.category.create({ data: { name: `Pay ${randomUUID()}`, slug: `pay-${randomUUID()}` } })).id;
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await redis.flushdb();
  fakeMpesa.queryResults.clear();
});

/** Creates a product with stock and a click-&-collect order for it. */
async function newOrder(opts: { price?: number; stock?: number; plan?: 'FULL' | 'DEPOSIT' } = {}) {
  const id = randomUUID().slice(0, 8);
  const price = opts.price ?? 4_500_00;
  const p = await prisma.product.create({
    data: { sku: `PAY-${id}`, slug: `pay-${id}`, name: `Pay test ${id}`, categoryId, status: 'ACTIVE', retailPriceCents: price, sourcingLeadTimeMins: 120 },
  });
  if ((opts.stock ?? 5) > 0) {
    await prisma.$transaction((tx) => inventoryService.receive(tx, { productId: p.id, quantity: opts.stock ?? 5, reason: 'OPENING_BALANCE' }));
  }
  const res = await app.inject({
    method: 'POST', url: '/api/v1/orders', headers: { 'idempotency-key': randomUUID() },
    payload: {
      items: [{ productId: p.id, quantity: 1 }], deliveryMethod: 'CLICK_AND_COLLECT', paymentPlan: opts.plan ?? 'FULL',
      expectedTotalCents: price, acceptSourcingLeadTime: true, contact: { name: 'Jane', phone: '0712345678' },
    },
  });
  expect(res.statusCode).toBe(201);
  return { number: res.json().data.number as string, productId: p.id, price };
}

const startMpesa = (number: string, body: object = { phone: '0712345678', contactPhone: '0712345678' }, key = randomUUID()) =>
  app.inject({ method: 'POST', url: `/api/v1/orders/${number}/payments/mpesa`, payload: body, headers: { 'idempotency-key': key } });

const callback = (body: object, secret = SECRET) =>
  app.inject({ method: 'POST', url: `/api/v1/webhooks/mpesa/stk/${secret}`, payload: body });

const checkoutIdOf = async (paymentId: string) => (await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).providerRequestId!;

describe('M-Pesa STK push', () => {
  it('happy path: push → callback → verified → order PLACED, stock held until dispatch', async () => {
    const { number, productId, price } = await newOrder();
    const start = await startMpesa(number);
    expect(start.statusCode).toBe(201);
    const { paymentId } = start.json().data;
    expect(fakeMpesa.pushes.at(-1)).toMatchObject({ amountShillings: price / 100, phone: '+254712345678' });

    const ack = await callback(FakeMpesaClient.callbackBody(await checkoutIdOf(paymentId), { amount: price / 100, receipt: 'SJK3XYZ001' }));
    expect(ack.json()).toEqual({ ResultCode: 0, ResultDesc: 'Accepted' });

    const status = (await app.inject({ method: 'GET', url: `/api/v1/payments/${paymentId}` })).json().data;
    // paid → auto-confirmed → straight into the picking queue
    expect(status).toMatchObject({ state: 'SUCCEEDED', receipt: 'SJK3XYZ001', order: { status: 'PICKING', paymentStatus: 'PAID', balanceDueCents: 0 } });

    const reservation = await prisma.stockReservation.findFirstOrThrow({ where: { productId } });
    expect(reservation.expiresAt).toBeNull(); // no longer expires
  });

  it('the same callback 5 times at once is counted ONCE', async () => {
    const { number, price } = await newOrder();
    const { paymentId } = (await startMpesa(number)).json().data;
    const body = FakeMpesaClient.callbackBody(await checkoutIdOf(paymentId), { amount: price / 100 });
    await Promise.all(Array.from({ length: 5 }, () => callback(body)));

    const order = await prisma.order.findUniqueOrThrow({ where: { number } });
    expect(order.amountPaidCents).toBe(price);
    expect(await prisma.outboxEvent.count({ where: { type: 'payment.succeeded', aggregateId: paymentId } })).toBe(1);
  });

  it('a FORGED success callback is caught by asking Safaricom', async () => {
    const { number } = await newOrder();
    const { paymentId } = (await startMpesa(number)).json().data;
    const checkoutId = await checkoutIdOf(paymentId);
    fakeMpesa.queryResults.set(checkoutId, { status: 'DONE', resultCode: '1032', resultDesc: 'Cancelled' }); // Safaricom says: not paid

    await callback(FakeMpesaClient.callbackBody(checkoutId));
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.state).toBe('PENDING');
    const event = await prisma.webhookEvent.findFirstOrThrow({ where: { externalId: checkoutId } });
    expect(event.error).toBe('VERIFICATION_FAILED');
    expect((await prisma.order.findUniqueOrThrow({ where: { number } })).status).toBe('PENDING_PAYMENT');
  });

  it('customer cancels on the phone → FAILED with a friendly reason, and can try again', async () => {
    const { number } = await newOrder();
    const { paymentId } = (await startMpesa(number)).json().data;
    await callback(FakeMpesaClient.callbackBody(await checkoutIdOf(paymentId), { resultCode: 1032 }));

    const status = (await app.inject({ method: 'GET', url: `/api/v1/payments/${paymentId}` })).json().data;
    expect(status).toMatchObject({ state: 'FAILED', failureReason: 'Payment cancelled on the phone' });

    const retry = await startMpesa(number);
    expect(retry.statusCode).toBe(201);
    expect(retry.json().data.paymentId).not.toBe(paymentId);
  });

  it('only one STK prompt at a time per order', async () => {
    const { number } = await newOrder();
    const first = await startMpesa(number);
    const second = await startMpesa(number);
    expect(second.statusCode).toBe(200);
    expect(second.json().data.paymentId).toBe(first.json().data.paymentId);
  });

  it('a 30% deposit places a sourced order; the balance is a second payment', async () => {
    const { number } = await newOrder({ price: 8_000_00, stock: 0, plan: 'DEPOSIT' });
    const dep = (await startMpesa(number)).json().data;
    expect(dep.amountCents).toBe(2_400_00);
    await callback(FakeMpesaClient.callbackBody(await checkoutIdOf(dep.paymentId), { amount: 2400 }));

    let order = await prisma.order.findUniqueOrThrow({ where: { number } });
    expect(order).toMatchObject({ status: 'SOURCING', paymentStatus: 'DEPOSIT_PAID', amountPaidCents: 2_400_00 }); // waits for the supplier

    const bal = (await startMpesa(number)).json().data;
    expect(bal.amountCents).toBe(5_600_00);
    await callback(FakeMpesaClient.callbackBody(await checkoutIdOf(bal.paymentId), { amount: 5600 }));
    order = await prisma.order.findUniqueOrThrow({ where: { number } });
    expect(order).toMatchObject({ paymentStatus: 'PAID', amountPaidCents: 8_000_00 });
  });

  it('no callback ever arrives → the reconcile job asks Safaricom and completes the payment', async () => {
    const { number } = await newOrder();
    const { paymentId } = (await startMpesa(number)).json().data;
    await prisma.payment.update({ where: { id: paymentId }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } });

    await paymentsService.reconcile();
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).state).toBe('SUCCEEDED');
    expect((await prisma.order.findUniqueOrThrow({ where: { number } })).status).toBe('PICKING');
  });

  it('money that arrives after the order expired is kept and flagged for a refund', async () => {
    const { number, price } = await newOrder();
    const { paymentId } = (await startMpesa(number)).json().data;
    await prisma.order.update({ where: { number }, data: { paymentDueBy: new Date(Date.now() - 1000) } });
    await ordersService.expireUnpaid();

    await callback(FakeMpesaClient.callbackBody(await checkoutIdOf(paymentId), { amount: price / 100 }));
    const order = await prisma.order.findUniqueOrThrow({ where: { number } });
    expect(order.status).toBe('CANCELLED');
    expect(order.amountPaidCents).toBe(price); // never lose track of money
    expect(await prisma.outboxEvent.count({ where: { type: 'alert.payment_for_cancelled_order', aggregateId: order.id } })).toBe(1);
  });

  it('protects the endpoints', async () => {
    const { number } = await newOrder();
    // wrong checkout phone for a guest order
    expect((await startMpesa(number, { phone: '0712345678', contactPhone: '0799999999' })).statusCode).toBe(404);
    // wrong webhook secret
    expect((await callback({}, 'wrong-secret-wrong-secret-xx')).statusCode).toBe(404);
    // missing Idempotency-Key
    const noKey = await app.inject({ method: 'POST', url: `/api/v1/orders/${number}/payments/mpesa`, payload: { phone: '0712345678', contactPhone: '0712345678' } });
    expect(noKey.statusCode).toBe(400);
  });
});
