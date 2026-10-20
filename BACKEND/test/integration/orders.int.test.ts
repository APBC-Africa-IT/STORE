import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../src/app/build-app';
import { prisma } from '../../src/shared/db/prisma';
import { redis } from '../../src/shared/redis';
import { inventoryService } from '../../src/modules/inventory/inventory.routes';
import { ordersService } from '../../src/modules/orders/orders.routes';
import { randomPhone } from '../helpers';

let app: FastifyInstance;
let categoryId: string;
let zoneId: string;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  categoryId = (await prisma.category.create({ data: { name: `Ord ${randomUUID()}`, slug: `ord-${randomUUID()}` } })).id;
  const z = randomUUID().slice(0, 6);
  zoneId = (await prisma.deliveryZone.create({
    data: { name: `Zone ${z}`, slug: `zone-${z}`, customerFeeCents: 300_00, riderFeeCents: 200_00, expressSurchargeCents: 200_00 },
  })).id;
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await redis.flushdb(); // reset rate limits
});

async function productWithStock(stock: number, opts: { price?: number; sourceable?: boolean } = {}) {
  const id = randomUUID().slice(0, 8);
  const p = await prisma.product.create({
    data: {
      sku: `ORD-${id}`, slug: `ord-${id}`, name: `Order test ${id}`, categoryId, status: 'ACTIVE',
      retailPriceCents: opts.price ?? 1_000_00, isSourceable: opts.sourceable ?? true, sourcingLeadTimeMins: 120,
    },
  });
  if (stock > 0) await prisma.$transaction((tx) => inventoryService.receive(tx, { productId: p.id, quantity: stock, reason: 'OPENING_BALANCE' }));
  return p;
}

const level = (productId: string) => prisma.inventoryLevel.findFirstOrThrow({ where: { productId } });

function orderBody(items: Array<{ productId: string; quantity: number }>, expectedTotalCents: number, extra: object = {}) {
  return {
    items, deliveryMethod: 'STANDARD', deliveryZoneId: zoneId, paymentPlan: 'FULL', expectedTotalCents,
    contact: { name: 'Jane Wanjiku', phone: '0712345678' },
    address: { line1: 'Ring Road, Apt 4', area: 'Westlands' },
    ...extra,
  };
}

const placeOrder = (body: object, key = randomUUID(), token?: string) =>
  app.inject({
    method: 'POST', url: '/api/v1/orders', payload: body,
    headers: { 'idempotency-key': key, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });

describe('checkout', () => {
  it('quote → order: holds stock for 30 minutes and is idempotent', async () => {
    const p = await productWithStock(5);
    const items = [{ productId: p.id, quantity: 2 }];

    const quote = await app.inject({ method: 'POST', url: '/api/v1/checkout/quote', payload: { items, deliveryMethod: 'STANDARD', deliveryZoneId: zoneId } });
    expect(quote.statusCode).toBe(200);
    const total = quote.json().data.totalCents;
    expect(total).toBe(2 * 1_000_00 + 300_00);
    expect((await level(p.id)).reserved).toBe(0); // quoting never reserves

    const key = randomUUID();
    const first = await placeOrder(orderBody(items, total), key);
    expect(first.statusCode).toBe(201);
    const order = first.json().data;
    expect(order.status).toBe('PENDING_PAYMENT');
    expect(order.number).toMatch(/^ORD-\d{6}-\d{5}$/);
    expect(order.contact.phone).toBe('+254712345678');
    expect(new Date(order.paymentDueBy).getTime() - Date.now()).toBeGreaterThan(29 * 60_000);
    expect((await level(p.id)).reserved).toBe(2);

    // Double-click / network retry → same order, no second reservation
    const again = await placeOrder(orderBody(items, total), key);
    expect(again.statusCode).toBe(200);
    expect(again.json().data.number).toBe(order.number);
    expect((await level(p.id)).reserved).toBe(2);

    // Same key, different order → rejected
    const misuse = await placeOrder(orderBody([{ productId: p.id, quantity: 1 }], 1_300_00), key);
    expect(misuse.statusCode).toBe(409);
    expect(misuse.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('rejects the order if the price changed since the customer saw it', async () => {
    const p = await productWithStock(5);
    const res = await placeOrder(orderBody([{ productId: p.id, quantity: 1 }], 999));
    expect(res.statusCode).toBe(409);
    expect(res.json().error.details.quote.totalCents).toBe(1_300_00);
  });

  it('sourced parts require the customer to accept the lead time', async () => {
    const p = await productWithStock(0);
    const items = [{ productId: p.id, quantity: 1 }];
    const without = await placeOrder(orderBody(items, 1_300_00));
    expect(without.statusCode).toBe(400);

    const withAccept = await placeOrder(orderBody(items, 1_300_00, { acceptSourcingLeadTime: true }));
    expect(withAccept.statusCode).toBe(201);
    expect(withAccept.json().data.items[0].fulfilment).toBe('SOURCED_FOR_YOU');
  });

  it('cash on delivery is placed immediately and holds stock without expiry', async () => {
    const p = await productWithStock(3);
    const res = await placeOrder(orderBody([{ productId: p.id, quantity: 1 }], 1_300_00, { paymentPlan: 'COD' }));
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ status: 'PLACED', paymentStatus: 'COD_PENDING', paymentDueBy: null });
    const reservation = await prisma.stockReservation.findFirstOrThrow({ where: { productId: p.id } });
    expect(reservation.expiresAt).toBeNull();
  });

  it('LAST UNIT: 10 customers order at once, exactly 1 succeeds', async () => {
    const p = await productWithStock(1, { sourceable: false });
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        placeOrder({ ...orderBody([{ productId: p.id, quantity: 1 }], 1_300_00), contact: { name: `Buyer ${i}`, phone: randomPhone() } }),
      ),
    );
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(9);
    expect((await level(p.id)).reserved).toBe(1);
  });
});

describe('after the order', () => {
  it('unpaid orders expire and give their stock back', async () => {
    const p = await productWithStock(4);
    const res = await placeOrder(orderBody([{ productId: p.id, quantity: 3 }], 3_300_00));
    const number = res.json().data.number;
    expect((await level(p.id)).reserved).toBe(3);

    await prisma.order.update({ where: { number }, data: { paymentDueBy: new Date(Date.now() - 1000) } });
    expect(await ordersService.expireUnpaid()).toBeGreaterThanOrEqual(1);

    const order = await prisma.order.findUniqueOrThrow({ where: { number } });
    expect(order.status).toBe('CANCELLED');
    expect(order.cancelledReason).toBe('PAYMENT_TIMEOUT');
    expect((await level(p.id)).reserved).toBe(0);
  });

  it('customers see and cancel only their own orders; guests track with their phone', async () => {
    const reg = async () =>
      (await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { firstName: 'A', lastName: 'B', email: `o-${randomUUID().slice(0, 6)}@test.local`, password: 'SuperSecret123' } })).json().data.accessToken as string;
    const alice = await reg();
    const bob = await reg();

    const p = await productWithStock(5);
    const res = await placeOrder(orderBody([{ productId: p.id, quantity: 1 }], 1_300_00), randomUUID(), alice);
    const number = res.json().data.number;

    const mine = await app.inject({ method: 'GET', url: '/api/v1/me/orders', headers: { authorization: `Bearer ${alice}` } });
    expect(mine.json().data.map((o: { number: string }) => o.number)).toContain(number);

    const bobs = await app.inject({ method: 'GET', url: `/api/v1/me/orders/${number}`, headers: { authorization: `Bearer ${bob}` } });
    expect(bobs.statusCode).toBe(404);

    const tracked = await app.inject({ method: 'GET', url: `/api/v1/orders/track/${number}?phone=0712 345 678` });
    expect(tracked.statusCode).toBe(200);
    const wrongPhone = await app.inject({ method: 'GET', url: `/api/v1/orders/track/${number}?phone=0799999999` });
    expect(wrongPhone.statusCode).toBe(404);

    const cancel = await app.inject({ method: 'POST', url: `/api/v1/me/orders/${number}/cancel`, headers: { authorization: `Bearer ${alice}` }, payload: {} });
    expect(cancel.json().data.status).toBe('CANCELLED');
    expect(cancel.json().data.timeline.at(-1).text).toBe('Order cancelled');
    expect((await level(p.id)).reserved).toBe(0);
  });

  it('customer order responses never contain cost or internal fields', async () => {
    const p = await productWithStock(2);
    const res = await placeOrder(orderBody([{ productId: p.id, quantity: 1 }], 1_300_00));
    const body = res.body.toLowerCase();
    for (const word of ['cost', 'idempotency', 'requesthash', 'version']) expect(body).not.toContain(word);
  });
});

describe('cart', () => {
  it('guest cart with token, never reserves stock, merges into the account after login', async () => {
    const p = await productWithStock(5);
    const add = await app.inject({ method: 'POST', url: '/api/v1/cart/items', payload: { productId: p.id, quantity: 2 } });
    expect(add.statusCode).toBe(201);
    const token = add.json().data.cartToken as string;
    expect(token).toBeTruthy();

    await app.inject({ method: 'POST', url: '/api/v1/cart/items', payload: { productId: p.id, quantity: 1 }, headers: { 'x-cart-token': token } });
    const view = await app.inject({ method: 'GET', url: '/api/v1/cart', headers: { 'x-cart-token': token } });
    expect(view.json().data.lines[0].quantity).toBe(3);
    expect(view.json().data.subtotalCents).toBe(3 * 1_000_00);
    expect((await level(p.id)).reserved).toBe(0); // BR-002

    const user = (await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { firstName: 'C', lastName: 'D', email: `cart-${randomUUID().slice(0, 6)}@test.local`, password: 'SuperSecret123' } })).json().data.accessToken;
    const merged = await app.inject({ method: 'POST', url: '/api/v1/cart/merge', payload: { cartToken: token }, headers: { authorization: `Bearer ${user}` } });
    expect(merged.json().data.itemCount).toBe(3);
  });

  it('rare parts cannot go in the cart', async () => {
    const rare = await productWithStock(0, { sourceable: false });
    const res = await app.inject({ method: 'POST', url: '/api/v1/cart/items', payload: { productId: rare.id } });
    expect(res.statusCode).toBe(400);
  });
});
