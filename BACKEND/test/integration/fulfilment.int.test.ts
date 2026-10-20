import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../src/app/build-app';
import { prisma } from '../../src/shared/db/prisma';
import { redis } from '../../src/shared/redis';
import { inventoryService } from '../../src/modules/inventory/inventory.routes';
import { staffToken } from '../helpers';

let app: FastifyInstance;
let categoryId: string;
let admin: string; // sees costs
let warehouse: string; // packs, cannot cancel, cannot see cost
let sales: string; // records counter payments

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  categoryId = (await prisma.category.create({ data: { name: `Ful ${randomUUID()}`, slug: `ful-${randomUUID()}` } })).id;
  admin = await staffToken(app, 'SUPER_ADMIN');
  warehouse = await staffToken(app, 'WAREHOUSE_STAFF');
  sales = await staffToken(app, 'SALES_STAFF');
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await redis.flushdb();
});

const api = (method: 'GET' | 'POST', url: string, token?: string, payload?: object) =>
  app.inject({ method, url: `/api/v1${url}`, ...(payload ? { payload } : {}), headers: token ? { authorization: `Bearer ${token}` } : {} });

const CHECKS = { checks: { correctParts: true, noDamage: true, brandedPackaging: true } };

/** A click-&-collect order for 2 units, unpaid, of a product with a bin and a known cost. */
async function newOrder(price = 2_000_00) {
  const id = randomUUID().slice(0, 8);
  const p = await prisma.product.create({
    data: { sku: `FUL-${id}`, slug: `ful-${id}`, name: `Fulfil ${id}`, categoryId, status: 'ACTIVE', retailPriceCents: price, avgCostCents: 900_00 },
  });
  await prisma.$transaction((tx) => inventoryService.receive(tx, { productId: p.id, quantity: 5, reason: 'OPENING_BALANCE' }));
  const bin = await prisma.bin.create({ data: { code: `T-${id}`.toUpperCase(), locationId: await inventoryService.defaultLocationId() } });
  await prisma.inventoryLevel.updateMany({ where: { productId: p.id }, data: { binId: bin.id } });

  const res = await app.inject({
    method: 'POST', url: '/api/v1/orders', headers: { 'idempotency-key': randomUUID() },
    payload: {
      items: [{ productId: p.id, quantity: 2 }], deliveryMethod: 'CLICK_AND_COLLECT', expectedTotalCents: 2 * price,
      contact: { name: 'Walk-in Wanjiru', phone: '0722000000' },
    },
  });
  expect(res.statusCode).toBe(201);
  return { number: res.json().data.number as string, productId: p.id, bin: bin.code, total: 2 * price };
}

const level = (productId: string) => prisma.inventoryLevel.findFirstOrThrow({ where: { productId } });

describe('fulfilment', () => {
  it('pay at the counter → auto picking queue → pack → ready → handover: stock becomes SOLD with cost recorded', async () => {
    const { number, productId, bin, total } = await newOrder();

    // Staff records a partial cash payment: not enough to confirm the order yet
    const part = await api('POST', `/admin/orders/${number}/payments`, sales, { method: 'CASH', amountCents: 1_000_00 });
    expect(part.statusCode).toBe(201);
    expect(part.json().data.status).toBe('PENDING_PAYMENT');

    // M-Pesa paybill / card needs a reference
    const noRef = await api('POST', `/admin/orders/${number}/payments`, sales, { method: 'CARD_POS_TERMINAL', amountCents: total - 1_000_00 });
    expect(noRef.statusCode).toBe(400);

    const rest = await api('POST', `/admin/orders/${number}/payments`, sales, { method: 'CARD_POS_TERMINAL', amountCents: total - 1_000_00, reference: 'AUTH123456' });
    expect(rest.json().data).toMatchObject({ status: 'PICKING', paymentStatus: 'PAID' });

    // It shows up in the picking queue with its shelf location
    const queue = (await api('GET', '/admin/fulfilment/queue', warehouse)).json().data;
    const entry = queue.find((o: { number: string }) => o.number === number);
    expect(entry.items[0]).toMatchObject({ quantity: 2, bin });

    // Packing requires the full quality checklist
    const sloppy = await api('POST', `/admin/orders/${number}/pack`, warehouse, { checks: { correctParts: true, noDamage: false, brandedPackaging: true } });
    expect(sloppy.statusCode).toBe(400);
    const packed = await api('POST', `/admin/orders/${number}/pack`, warehouse, CHECKS);
    expect(packed.json().data.status).toBe('PACKED');
    expect(packed.json().data.items[0].unitCostCents).toBeUndefined(); // warehouse can't see cost

    expect((await api('POST', `/admin/orders/${number}/ready-for-collection`, warehouse)).json().data.status).toBe('READY_FOR_COLLECTION');

    const before = await level(productId);
    const done = await api('POST', `/admin/orders/${number}/handover`, warehouse);
    expect(done.json().data.status).toBe('COMPLETED');

    const after = await level(productId);
    expect([after.onHand, after.reserved]).toEqual([before.onHand - 2, before.reserved - 2]);
    expect(await prisma.stockMovement.count({ where: { productId, reason: 'SALE', referenceId: number } })).toBe(1);

    // Admin sees cost and margin; the customer timeline is clean
    const adminView = (await api('GET', `/admin/orders/${number}`, admin)).json().data;
    expect(adminView.items[0].unitCostCents).toBe(900_00);
    expect(adminView.margin.marginCents).toBeGreaterThan(0);
    expect(adminView.timeline.map((t: { status: string }) => t.status)).toEqual(
      ['PENDING_PAYMENT', 'PLACED', 'CONFIRMED', 'PICKING', 'PACKED', 'READY_FOR_COLLECTION', 'COMPLETED'],
    );
  });

  it('cannot skip steps or hand over unpaid orders', async () => {
    const { number } = await newOrder();
    const skip = await api('POST', `/admin/orders/${number}/pack`, warehouse, CHECKS); // still PENDING_PAYMENT
    expect(skip.statusCode).toBe(409);
    expect(skip.json().error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('two staff packing the same order at once: one wins', async () => {
    const { number, total } = await newOrder();
    await api('POST', `/admin/orders/${number}/payments`, sales, { method: 'CASH', amountCents: total });
    const results = await Promise.all([1, 2].map(() => api('POST', `/admin/orders/${number}/pack`, warehouse, CHECKS)));
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  });

  it('only managers cancel; cancelling releases stock and flags paid money for refund', async () => {
    const { number, productId, total } = await newOrder();
    await api('POST', `/admin/orders/${number}/payments`, sales, { method: 'CASH', amountCents: total });
    expect((await level(productId)).reserved).toBe(2);

    expect((await api('POST', `/admin/orders/${number}/cancel`, warehouse, { reason: 'test' })).statusCode).toBe(403);

    const cancelled = await api('POST', `/admin/orders/${number}/cancel`, admin, { reason: 'Customer changed mind' });
    expect(cancelled.json().data.status).toBe('CANCELLED');
    expect((await level(productId)).reserved).toBe(0);
    const order = await prisma.order.findUniqueOrThrow({ where: { number } });
    const event = await prisma.outboxEvent.findFirstOrThrow({ where: { type: 'order.cancelled', aggregateId: order.id } });
    expect((event.payload as { refundDueCents: number }).refundDueCents).toBe(total);
  });

  it('lists, filters, notes and prints', async () => {
    const { number } = await newOrder();
    const list = (await api('GET', `/admin/orders?status=PENDING_PAYMENT&q=${number}`, warehouse)).json().data;
    expect(list.map((o: { number: string }) => o.number)).toEqual([number]);

    const noted = await api('POST', `/admin/orders/${number}/notes`, warehouse, { body: 'Customer will collect after 5pm' });
    expect(noted.json().data.notes[0].body).toBe('Customer will collect after 5pm');
    // notes are internal: the customer tracking view must not show them
    const tracked = await app.inject({ method: 'GET', url: `/api/v1/orders/track/${number}?phone=0722000000` });
    expect(tracked.body).not.toContain('5pm');

    for (const doc of ['label.pdf', 'packing-slip.pdf']) {
      const pdf = await api('GET', `/admin/orders/${number}/${doc}`, warehouse);
      expect(pdf.statusCode).toBe(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    }

    const customer = (await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { firstName: 'X', lastName: 'Y', email: `f-${randomUUID().slice(0, 6)}@test.local`, password: 'SuperSecret123' } })).json().data.accessToken;
    expect((await api('GET', '/admin/orders', customer)).statusCode).toBe(403);
  });
});
