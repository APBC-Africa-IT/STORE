import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../src/app/build-app';
import { prisma } from '../../src/shared/db/prisma';
import { redis } from '../../src/shared/redis';
import { normalizePartNumber } from '../../src/shared/text';
import { staffToken } from '../helpers';

let app: FastifyInstance;
let categoryId: string;
let admin: string; // creates orders/payments, can approve
let buyer: string; // PROCUREMENT_OFFICER
let ops: string; // OPERATIONS_MANAGER (approves restock)
let warehouse: string; // receives goods

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  categoryId = (await prisma.category.create({ data: { name: `Proc ${randomUUID()}`, slug: `proc-${randomUUID()}` } })).id;
  admin = await staffToken(app, 'SUPER_ADMIN');
  buyer = await staffToken(app, 'PROCUREMENT_OFFICER');
  ops = await staffToken(app, 'OPERATIONS_MANAGER');
  warehouse = await staffToken(app, 'WAREHOUSE_STAFF');
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await redis.flushdb();
});

const api = (method: 'GET' | 'POST' | 'PUT', url: string, token?: string, payload?: object) =>
  app.inject({ method, url: `/api/v1${url}`, ...(payload ? { payload } : {}), headers: token ? { authorization: `Bearer ${token}` } : {} });

async function newProduct(price = 5_800_00) {
  const id = randomUUID().slice(0, 8);
  const partNumber = `48510-${id}`;
  const p = await prisma.product.create({
    data: {
      sku: `PRC-${id}`, slug: `prc-${id}`, name: `Shock absorber ${id}`, categoryId, status: 'ACTIVE', retailPriceCents: price,
      partNumbers: { create: { type: 'OEM', number: partNumber, normalized: normalizePartNumber(partNumber) } },
    },
  });
  return { ...p, partNumber };
}

async function newSupplier(name: string, type = 'PRIMARY', leadTimeMins = 90) {
  const res = await api('POST', '/admin/suppliers', buyer, {
    name: `${name} ${randomUUID().slice(0, 4)}`, type, phone: '0733000111', addressLine: 'Kirinyaga Road', area: 'CBD', typicalLeadTimeMins: leadTimeMins,
  });
  expect(res.statusCode).toBe(201);
  return res.json().data as { id: string; name: string; code: string };
}

/** A paid click-&-collect order for a part we don't stock → it waits in SOURCING. */
async function sourcedOrder(productId: string, qty = 1, price = 5_800_00) {
  const res = await app.inject({
    method: 'POST', url: '/api/v1/orders', headers: { 'idempotency-key': randomUUID() },
    payload: {
      items: [{ productId, quantity: qty }], deliveryMethod: 'CLICK_AND_COLLECT', expectedTotalCents: qty * price,
      acceptSourcingLeadTime: true, contact: { name: 'Otieno', phone: '0711111111' },
    },
  });
  expect(res.statusCode).toBe(201);
  const number = res.json().data.number as string;
  const paid = await api('POST', `/admin/orders/${number}/payments`, admin, { method: 'CASH', amountCents: qty * price });
  expect(paid.json().data.status).toBe('SOURCING');
  const item = await prisma.orderItem.findFirstOrThrow({ where: { order: { number } } });
  return { number, orderItemId: item.id };
}

const grn = (poNumber: string, lines: object[], extra: object = {}) =>
  api('POST', '/admin/grns', warehouse, { purchaseOrderNumber: poNumber, lines, ...extra });
const OK = { correctPart: true, correctQty: true, noDamage: true };

describe('sourcing a part for a customer', () => {
  it('queue → ranked suppliers → PO → supplier confirms → GRN → order moves to PICKING with landed cost', async () => {
    const product = await newProduct();
    const primary = await newSupplier('Kirinyaga Motors', 'PRIMARY', 60);
    const backup = await newSupplier('Backup Spares', 'SECONDARY');
    await api('PUT', `/admin/suppliers/${primary.id}/catalog`, buyer, { items: [{ partNumber: product.partNumber, description: 'KYB shock', costCents: 3_000_00, availability: 'IN_STOCK' }] });
    const cat = await api('PUT', `/admin/suppliers/${backup.id}/catalog`, buyer, { items: [{ partNumber: product.partNumber.replace('-', ' '), description: 'Shock', costCents: 2_500_00, availability: 'IN_STOCK' }] });
    expect(cat.json().data.matchedToProducts).toBe(1); // matched by part number, any format

    // Customers see a lead time based on the fastest supplier (60 + 45 min hub processing)
    const pub = (await api('GET', `/products/${product.slug}`)).json().data;
    expect(pub.availability).toMatchObject({ status: 'AVAILABLE_TO_ORDER', leadTimeMins: 105 });

    const { number, orderItemId } = await sourcedOrder(product.id);

    const queue = (await api('GET', '/admin/sourcing/queue', buyer)).json().data;
    expect(queue.find((q: { orderItemId: string }) => q.orderItemId === orderItemId)).toMatchObject({ supplierOptions: 2 });

    const candidates = (await api('GET', `/admin/sourcing/candidates?productId=${product.id}`, buyer)).json().data;
    expect(candidates[0].supplierId).toBe(primary.id); // primary beats the cheaper secondary

    const created = await api('POST', '/admin/purchase-orders/reactive', buyer, { supplierId: primary.id, orderItemIds: [orderItemId] });
    expect(created.statusCode).toBe(201);
    const po = created.json().data;
    expect(po).toMatchObject({ status: 'DRAFT', kind: 'REACTIVE', totalCostCents: 3_000_00 });

    const sent = await api('POST', `/admin/purchase-orders/${po.number}/send`, buyer, { channel: 'PHONE' });
    expect(sent.json().data.status).toBe('SENT');

    // Still waiting for the part; the line is now marked as ordered from the supplier
    expect((await prisma.order.findUniqueOrThrow({ where: { number } })).status).toBe('SOURCING');
    expect((await prisma.orderItem.findUniqueOrThrow({ where: { id: orderItemId } })).sourcingStatus).toBe('PO_SENT');

    const confirmed = await api('POST', `/admin/purchase-orders/${po.number}/supplier-response`, buyer, { response: 'CONFIRMED' });
    expect(confirmed.json().data.status).toBe('CONFIRMED_BY_SUPPLIER');
    expect(confirmed.json().data.collectionCode).toMatch(/^\d{6}$/);
    expect(confirmed.body).not.toContain('collectionCodeHash');

    const received = await grn(po.number, [{ purchaseOrderItemId: po.items[0].id, receivedQty: 1, acceptedQty: 1, checks: OK }], { collectionFeeCents: 200_00 });
    expect(received.statusCode).toBe(201);
    expect(received.json().data).toMatchObject({ status: 'PASSED', purchaseOrder: { status: 'RECEIVED' } });

    const after = await prisma.order.findUniqueOrThrow({ where: { number }, include: { items: true, statusHistory: true } });
    expect(after.status).toBe('PICKING');
    expect(after.items[0]).toMatchObject({ sourcingStatus: 'RECEIVED', unitCostCents: 3_200_00 }); // 3,000 + 200 boda boda
    const reservation = await prisma.stockReservation.findFirstOrThrow({ where: { orderItemId, status: 'ACTIVE' } });
    expect(reservation.quantity).toBe(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).lastCostCents).toBe(3_200_00);

    // "Track your sourcing" — and the supplier is never named to the customer (BR-007)
    const tracked = await app.inject({ method: 'GET', url: `/api/v1/orders/track/${number}?phone=0711111111` });
    const texts = tracked.json().data.timeline.map((t: { text: string }) => t.text);
    expect(texts).toEqual(expect.arrayContaining(['Part confirmed with our supplier — arranging collection', 'Your part has arrived at our hub and passed our quality check']));
    expect(tracked.body).not.toContain(primary.name);
    expect(tracked.body).not.toContain('PO-');
  });

  it('supplier rejects → the line goes back to the queue and another supplier can take it', async () => {
    const product = await newProduct();
    const s1 = await newSupplier('Rejects Ltd');
    const s2 = await newSupplier('Saviour Ltd');
    const { orderItemId } = await sourcedOrder(product.id);

    const po1 = (await api('POST', '/admin/purchase-orders/reactive', buyer, { supplierId: s1.id, orderItemIds: [orderItemId], unitCosts: { [orderItemId]: 3_000_00 } })).json().data;
    await api('POST', `/admin/purchase-orders/${po1.number}/send`, buyer, { channel: 'WHATSAPP' });
    const rej = await api('POST', `/admin/purchase-orders/${po1.number}/supplier-response`, buyer, { response: 'REJECTED', reason: 'Out of stock' });
    expect(rej.json().data.status).toBe('REJECTED_BY_SUPPLIER');
    expect((await prisma.orderItem.findUniqueOrThrow({ where: { id: orderItemId } })).sourcingStatus).toBe('AWAITING_PO');

    const po2 = await api('POST', '/admin/purchase-orders/reactive', buyer, { supplierId: s2.id, orderItemIds: [orderItemId], unitCosts: { [orderItemId]: 3_100_00 } });
    expect(po2.statusCode).toBe(201);
  });

  it('a part that FAILS the quality check is not stocked or allocated (BR-012)', async () => {
    const product = await newProduct();
    const s = await newSupplier('Dodgy Parts');
    const { number, orderItemId } = await sourcedOrder(product.id);
    const po = (await api('POST', '/admin/purchase-orders/reactive', buyer, { supplierId: s.id, orderItemIds: [orderItemId], unitCosts: { [orderItemId]: 3_000_00 } })).json().data;
    await api('POST', `/admin/purchase-orders/${po.number}/send`, buyer, { channel: 'PHONE' });
    await api('POST', `/admin/purchase-orders/${po.number}/supplier-response`, buyer, { response: 'CONFIRMED' });

    // Can't "accept" a damaged part
    const sneaky = await grn(po.number, [{ purchaseOrderItemId: po.items[0].id, receivedQty: 1, acceptedQty: 1, checks: { ...OK, noDamage: false } }]);
    expect(sneaky.statusCode).toBe(400);

    const failed = await grn(po.number, [{ purchaseOrderItemId: po.items[0].id, receivedQty: 1, acceptedQty: 0, checks: { ...OK, noDamage: false }, rejectionReason: 'Cracked housing' }]);
    expect(failed.json().data.status).toBe('FAILED');

    expect((await prisma.order.findUniqueOrThrow({ where: { number } })).status).toBe('SOURCING');
    expect((await prisma.orderItem.findUniqueOrThrow({ where: { id: orderItemId } })).sourcingStatus).toBe('FAILED');
    expect(await prisma.inventoryLevel.count({ where: { productId: product.id, onHand: { gt: 0 } } })).toBe(0);
  });

  it('refuses to buy at a loss without Finance approval (BR-004)', async () => {
    const product = await newProduct(1_160_00); // sells for 1,000 ex-VAT
    const s = await newSupplier('Pricey');
    const { orderItemId } = await sourcedOrder(product.id, 1, 1_160_00);
    const res = await api('POST', '/admin/purchase-orders/reactive', buyer, { supplierId: s.id, orderItemIds: [orderItemId], unitCosts: { [orderItemId]: 1_200_00 } });
    expect(res.statusCode).toBe(422);
  });
});

describe('restocking', () => {
  it('needs approval by someone else, then stock automatically serves waiting customers', async () => {
    const product = await newProduct();
    const s = await newSupplier('Bulk Imports');
    const { number } = await sourcedOrder(product.id, 2); // a customer waiting for 2

    const po = (await api('POST', '/admin/purchase-orders/restock', buyer, { supplierId: s.id, lines: [{ productId: product.id, quantity: 10, unitCostCents: 2_000_00 }] })).json().data;

    const early = await api('POST', `/admin/purchase-orders/${po.number}/send`, buyer, { channel: 'EMAIL' });
    expect(early.json().error.code).toBe('APPROVAL_REQUIRED'); // BR-003

    await api('POST', `/admin/purchase-orders/${po.number}/submit`, buyer);
    expect((await api('POST', `/admin/purchase-orders/${po.number}/approve`, buyer)).statusCode).toBe(403); // no permission
    expect((await api('POST', `/admin/purchase-orders/${po.number}/approve`, ops)).json().data.status).toBe('APPROVED');

    await api('POST', `/admin/purchase-orders/${po.number}/send`, buyer, { channel: 'EMAIL' });
    await api('POST', `/admin/purchase-orders/${po.number}/supplier-response`, buyer, { response: 'CONFIRMED' });
    const res = await grn(po.number, [{ purchaseOrderItemId: po.items[0].id, receivedQty: 10, acceptedQty: 10, checks: OK }]);
    expect(res.statusCode).toBe(201);

    // The waiting customer got 2 of the 10 automatically
    expect((await prisma.order.findUniqueOrThrow({ where: { number } })).status).toBe('PICKING');
    const level = await prisma.inventoryLevel.findFirstOrThrow({ where: { productId: product.id } });
    expect([level.onHand, level.reserved]).toEqual([10, 2]);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).avgCostCents).toBe(2_000_00);
  });

  it('warehouse staff can receive goods but not create purchase orders', async () => {
    const product = await newProduct();
    const s = await newSupplier('Any');
    const res = await api('POST', '/admin/purchase-orders/restock', warehouse, { supplierId: s.id, lines: [{ productId: product.id, quantity: 1, unitCostCents: 100 }] });
    expect(res.statusCode).toBe(403);
  });
});
