import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomInt, randomUUID } from 'node:crypto';
import { buildApp } from '../../src/app/build-app';
import { prisma } from '../../src/shared/db/prisma';
import { redis } from '../../src/shared/redis';
import { decrypt } from '../../src/shared/crypto/encryption';
import { normalizePartNumber } from '../../src/shared/text';
import { inventoryService } from '../../src/modules/inventory/inventory.routes';
import { logisticsService } from '../../src/modules/logistics/logistics.routes';
import { randomPhone, staffToken } from '../helpers';

let app: FastifyInstance;
let categoryId: string;
let zone: { id: string; name: string };
let admin: string; // records payments
let ops: string; // OPERATIONS_MANAGER: manages riders
let dispatcher: string; // DISPATCHER: assigns jobs, counts COD
let warehouse: string; // packs, receives goods
let buyer: string; // PROCUREMENT_OFFICER

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  categoryId = (await prisma.category.create({ data: { name: `Log ${randomUUID()}`, slug: `log-${randomUUID()}` } })).id;
  const z = randomUUID().slice(0, 6);
  zone = await prisma.deliveryZone.create({
    data: { name: `Zone ${z}`, slug: `zone-${z}`, customerFeeCents: 300_00, riderFeeCents: 250_00, expressSurchargeCents: 200_00 },
  });
  admin = await staffToken(app, 'SUPER_ADMIN');
  ops = await staffToken(app, 'OPERATIONS_MANAGER');
  dispatcher = await staffToken(app, 'DISPATCHER');
  warehouse = await staffToken(app, 'WAREHOUSE_STAFF');
  buyer = await staffToken(app, 'PROCUREMENT_OFFICER');
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await redis.flushdb();
});

const api = (method: 'GET' | 'POST' | 'PUT', url: string, token?: string, payload?: object) =>
  app.inject({ method, url: `/api/v1${url}`, ...(payload ? { payload } : {}), headers: token ? { authorization: `Bearer ${token}` } : {} });

const PACK = { checks: { correctParts: true, noDamage: true, brandedPackaging: true } };
const QC_OK = { correctPart: true, correctQty: true, noDamage: true };

async function newRider(name = 'Kamau') {
  const phone = randomPhone();
  const res = await api('POST', '/admin/riders', ops, {
    name: `${name} ${randomUUID().slice(0, 4)}`, phone, nationalId: String(randomInt(10_000_000, 99_999_999)), bikePlate: 'KMFA 123B', mpesaNumber: phone,
  });
  expect(res.statusCode).toBe(201);
  const rider = res.json().data as { id: string; name: string; phone: string; code: string };
  await api('POST', `/admin/riders/${rider.id}/duty`, dispatcher, { isOnDuty: true });
  return rider;
}

/** A packed delivery order for 1 unit of an in-stock part. FULL = paid in cash first; COD = pay at the door. */
async function packedOrder(plan: 'FULL' | 'COD' = 'FULL', price = 2_000_00) {
  const id = randomUUID().slice(0, 8);
  const p = await prisma.product.create({
    data: { sku: `LOG-${id}`, slug: `log-${id}`, name: `Brake pads ${id}`, categoryId, status: 'ACTIVE', retailPriceCents: price, avgCostCents: 1_000_00 },
  });
  await prisma.$transaction((tx) => inventoryService.receive(tx, { productId: p.id, quantity: 3, reason: 'OPENING_BALANCE' }));
  const total = price + 300_00;
  const res = await app.inject({
    method: 'POST', url: '/api/v1/orders', headers: { 'idempotency-key': randomUUID() },
    payload: {
      items: [{ productId: p.id, quantity: 1 }], deliveryMethod: 'STANDARD', deliveryZoneId: zone.id, paymentPlan: plan,
      expectedTotalCents: total, contact: { name: 'Achieng', phone: '0711222333' }, address: { line1: 'Kindaruma Rd, Hse 7', area: 'Kilimani' },
    },
  });
  expect(res.statusCode).toBe(201);
  const number = res.json().data.number as string;
  if (plan === 'FULL') await api('POST', `/admin/orders/${number}/payments`, admin, { method: 'CASH', amountCents: total });
  const packed = await api('POST', `/admin/orders/${number}/pack`, warehouse, PACK);
  expect(packed.json().data.status).toBe('PACKED');
  return { number, productId: p.id, total };
}

const level = (productId: string) => prisma.inventoryLevel.findFirstOrThrow({ where: { productId } });
const order = (number: string) => prisma.order.findUniqueOrThrow({ where: { number } });
const track = (number: string) => app.inject({ method: 'GET', url: `/api/v1/orders/track/${number}?phone=0711222333` });

/** The delivery OTP is SMSed to the customer (Step 13). In tests we read it from the outbox event. */
async function otpFor(jobId: string) {
  const ev = await prisma.outboxEvent.findFirstOrThrow({ where: { type: 'logistics.out_for_delivery', aggregateId: jobId } });
  return decrypt((ev.payload as { otpEnc: string }).otpEnc);
}

describe('riders', () => {
  it('national ID is encrypted at rest and never returned by the API', async () => {
    const nationalId = '27654321';
    const phone = randomPhone();
    const res = await api('POST', '/admin/riders', ops, { name: 'Otieno Rider', phone, nationalId, bikePlate: 'kmfb 456c', mpesaNumber: phone });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ nationalIdLast4: '4321', bikePlate: 'KMFB 456C', status: 'ACTIVE' });
    expect(res.body).not.toContain(nationalId);
    expect(res.body).not.toContain('nationalIdEnc');

    const row = await prisma.rider.findUniqueOrThrow({ where: { id: res.json().data.id } });
    expect(row.nationalIdEnc.startsWith('v1.')).toBe(true);
    expect(decrypt(row.nationalIdEnc)).toBe(nationalId);

    const dup = await api('POST', '/admin/riders', ops, { name: 'Copy Cat', phone, nationalId: '11111111', bikePlate: 'KMFC 111D', mpesaNumber: phone });
    expect(dup.statusCode).toBe(409);
    // Dispatchers assign riders but cannot register them
    expect((await api('POST', '/admin/riders', dispatcher, { name: 'X', phone: randomPhone() })).statusCode).toBe(403);
  });
});

describe('deliveries', () => {
  it('prepaid: job → assign → dispatch (stock sold) → OTP proof → order completed, rider earns the zone fee', async () => {
    const { number, productId } = await packedOrder('FULL');
    const rider = await newRider();

    const created = await api('POST', '/admin/logistics/jobs/delivery', dispatcher, { orderNumber: number });
    expect(created.statusCode).toBe(201);
    const job = created.json().data;
    expect(job).toMatchObject({ type: 'DELIVERY', status: 'CREATED', codAmountCents: 0, riderFeeCents: 250_00 });

    // One active delivery job per order (database partial unique index)
    expect((await api('POST', '/admin/logistics/jobs/delivery', dispatcher, { orderNumber: number })).statusCode).toBe(409);

    expect((await api('POST', `/admin/logistics/jobs/${job.number}/assign`, dispatcher, { riderId: rider.id })).json().data.status).toBe('ASSIGNED');

    const before = await level(productId);
    const started = await api('POST', `/admin/logistics/jobs/${job.number}/start`, dispatcher);
    expect(started.json().data.status).toBe('EN_ROUTE');
    expect(started.body).not.toContain('deliveryOtpHash');
    expect((await order(number)).status).toBe('DISPATCHED');
    const after = await level(productId);
    expect([after.onHand, after.reserved]).toEqual([before.onHand - 1, before.reserved - 1]); // SOLD at dispatch

    // A wrong code is counted even though the request fails
    const wrong = await api('POST', `/admin/logistics/jobs/${job.number}/delivered`, dispatcher, { type: 'OTP', code: '000000' });
    expect(wrong.statusCode).toBe(400);
    expect((await prisma.logisticsJob.findUniqueOrThrow({ where: { id: job.id } })).otpAttempts).toBe(1);

    const done = await api('POST', `/admin/logistics/jobs/${job.number}/delivered`, dispatcher, { type: 'OTP', code: await otpFor(job.id) });
    expect(done.json().data).toMatchObject({ status: 'DELIVERED', proof: { type: 'OTP' } });
    expect((await order(number)).status).toBe('COMPLETED');

    const earnings = (await api('GET', `/admin/riders/${rider.id}/earnings`, ops)).json().data;
    expect(earnings.totalCents).toBe(250_00);

    // The customer sees who is bringing their parcel
    const timeline = track(number).then((r) => r.json().data.timeline.map((t: { text: string }) => t.text));
    expect(await timeline).toEqual(expect.arrayContaining(['Out for delivery', `Your rider is ${rider.name} (${rider.phone})`, 'Delivered — enjoy!']));
  });

  it('failed delivery: the parcel comes back, stock is held again, and it can go out again', async () => {
    const { number, productId } = await packedOrder('FULL');
    const rider = await newRider();
    const before = await level(productId);
    const job = (await api('POST', '/admin/logistics/jobs/delivery', dispatcher, { orderNumber: number, riderId: rider.id })).json().data;
    await api('POST', `/admin/logistics/jobs/${job.number}/start`, dispatcher);

    // A trip in progress can't simply be cancelled
    expect((await api('POST', `/admin/logistics/jobs/${job.number}/cancel`, dispatcher, { reason: 'oops' })).statusCode).toBe(409);

    const failed = await api('POST', `/admin/logistics/jobs/${job.number}/fail`, dispatcher, { reason: 'Customer not answering phone' });
    expect(failed.json().data.status).toBe('FAILED');
    expect((await order(number)).status).toBe('DISPATCHED'); // parcel is still with the rider

    const back = await api('POST', `/admin/logistics/jobs/${job.number}/returned`, dispatcher);
    expect(back.json().data.status).toBe('RETURNED');
    expect((await order(number)).status).toBe('PACKED');
    const now = await level(productId);
    expect([now.onHand, now.reserved]).toEqual([before.onHand, before.reserved]);
    expect(await prisma.stockMovement.count({ where: { productId, reason: 'DELIVERY_RETURNED' } })).toBe(1);
    expect((await api('GET', `/admin/riders/${rider.id}/earnings`, ops)).json().data.totalCents).toBe(250_00); // rider still did the trip

    const again = await api('POST', '/admin/logistics/jobs/delivery', dispatcher, { orderNumber: number });
    expect(again.statusCode).toBe(201);
  });

  it('a rider never gets more than 3 active jobs, even when dispatchers click at the same moment', async () => {
    const rider = await newRider('Busy');
    const jobs = [];
    for (let i = 0; i < 4; i++) {
      const { number } = await packedOrder('FULL');
      jobs.push((await api('POST', '/admin/logistics/jobs/delivery', dispatcher, { orderNumber: number })).json().data.number as string);
    }
    const results = await Promise.all(jobs.map((n) => api('POST', `/admin/logistics/jobs/${n}/assign`, dispatcher, { riderId: rider.id })));
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 200, 200, 409]);

    const available = (await api('GET', '/admin/riders/available', dispatcher)).json().data;
    expect(available.find((r: { id: string }) => r.id === rider.id)).toBeUndefined(); // full
  });
});

describe('cash on delivery (BR-006)', () => {
  it('rider holds the cash until it is counted; the count settles the order exactly once', async () => {
    const { number, total } = await packedOrder('COD');
    expect((await order(number)).paymentStatus).toBe('COD_PENDING');
    const rider = await newRider();
    const job = (await api('POST', '/admin/logistics/jobs/delivery', dispatcher, { orderNumber: number, riderId: rider.id })).json().data;
    expect(job.codAmountCents).toBe(total);
    await api('POST', `/admin/logistics/jobs/${job.number}/start`, dispatcher);
    const done = await api('POST', `/admin/logistics/jobs/${job.number}/delivered`, dispatcher, {
      type: 'PHOTO', photoUrl: 'https://files.myspares.co.ke/pod/1.jpg', recipientName: 'Achieng',
    });
    expect(done.json().data.status).toBe('DELIVERED');
    expect((await order(number)).status).toBe('DELIVERED'); // not complete: the cash is still with the rider

    const outstanding = (await api('GET', `/admin/logistics/cod?status=OUTSTANDING&riderId=${rider.id}`, dispatcher)).json().data;
    expect(outstanding).toHaveLength(1);
    const codId = outstanding[0].id as string;

    // Not handed in after 24 hours → one alert, never repeated
    await prisma.codCollection.update({ where: { id: codId }, data: { collectedAt: new Date(Date.now() - 25 * 3600_000) } });
    await logisticsService.alertOverdueCod();
    await logisticsService.alertOverdueCod();
    expect(await prisma.outboxEvent.count({ where: { type: 'alert.cod_overdue', aggregateId: codId } })).toBe(1);

    // Two staff count the same cash at once → exactly one wins
    const counts = await Promise.all([1, 2].map(() => api('POST', `/admin/logistics/cod/${codId}/reconcile`, dispatcher, { handedOverCents: total })));
    expect(counts.map((r) => r.statusCode).sort()).toEqual([200, 409]);

    const settled = await order(number);
    expect(settled).toMatchObject({ status: 'COMPLETED', paymentStatus: 'PAID', amountPaidCents: total });
    expect(await prisma.payment.count({ where: { orderId: settled.id, method: 'COD', state: 'SUCCEEDED' } })).toBe(1);
  });

  it('a short count is flagged and the order is not completed', async () => {
    const { number, total } = await packedOrder('COD');
    const rider = await newRider();
    const job = (await api('POST', '/admin/logistics/jobs/delivery', dispatcher, { orderNumber: number, riderId: rider.id })).json().data;
    await api('POST', `/admin/logistics/jobs/${job.number}/start`, dispatcher);
    await api('POST', `/admin/logistics/jobs/${job.number}/delivered`, dispatcher, { type: 'OTP', code: await otpFor(job.id) });
    const cod = await prisma.codCollection.findUniqueOrThrow({ where: { jobId: job.id } });

    const res = await api('POST', `/admin/logistics/cod/${cod.id}/reconcile`, dispatcher, { handedOverCents: total - 500_00, note: 'Rider says change was short' });
    expect(res.json().data).toMatchObject({ status: 'DISCREPANCY', handedOverCents: total - 500_00 });
    expect(await prisma.outboxEvent.count({ where: { type: 'alert.cod_discrepancy', aggregateId: cod.id } })).toBe(1);
    expect(await order(number)).toMatchObject({ status: 'DELIVERED', amountPaidCents: total - 500_00 });

    // Finance can deduct the shortfall from the rider's earnings (audited)
    const ded = await api('POST', `/admin/riders/${rider.id}/earnings`, ops, { type: 'DEDUCTION', amountCents: 500_00, reason: `COD shortfall ${number}` });
    expect(ded.json().data.amountCents).toBe(-500_00);
    expect((await api('GET', `/admin/riders/${rider.id}/earnings`, ops)).json().data.totalCents).toBe(250_00 - 500_00);
  });
});

// ───────────── Collections from suppliers ─────────────

/** A paid click-&-collect order for a part we don't stock, and a supplier-confirmed PO for it. */
async function confirmedPo() {
  const id = randomUUID().slice(0, 8);
  const partNumber = `90915-${id}`;
  const product = await prisma.product.create({
    data: {
      sku: `COL-${id}`, slug: `col-${id}`, name: `Oil filter ${id}`, categoryId, status: 'ACTIVE', retailPriceCents: 5_800_00,
      partNumbers: { create: { type: 'OEM', number: partNumber, normalized: normalizePartNumber(partNumber) } },
    },
  });
  const supplier = (await api('POST', '/admin/suppliers', buyer, {
    name: `Supplier ${id}`, type: 'PRIMARY', phone: '0733000111', addressLine: 'Kirinyaga Road', area: zone.name, // same area as our zone → zone rider fee
  })).json().data;

  const res = await app.inject({
    method: 'POST', url: '/api/v1/orders', headers: { 'idempotency-key': randomUUID() },
    payload: {
      items: [{ productId: product.id, quantity: 1 }], deliveryMethod: 'CLICK_AND_COLLECT', expectedTotalCents: 5_800_00,
      acceptSourcingLeadTime: true, contact: { name: 'Achieng', phone: '0711222333' },
    },
  });
  const number = res.json().data.number as string;
  await api('POST', `/admin/orders/${number}/payments`, admin, { method: 'CASH', amountCents: 5_800_00 });
  const orderItem = await prisma.orderItem.findFirstOrThrow({ where: { order: { number } } });

  const po = (await api('POST', '/admin/purchase-orders/reactive', buyer, { supplierId: supplier.id, orderItemIds: [orderItem.id], unitCosts: { [orderItem.id]: 3_000_00 } })).json().data;
  await api('POST', `/admin/purchase-orders/${po.number}/send`, buyer, { channel: 'PHONE' });
  await api('POST', `/admin/purchase-orders/${po.number}/supplier-response`, buyer, { response: 'CONFIRMED' });
  return { number, orderItemId: orderItem.id, po, supplier };
}

describe('collections', () => {
  it('code is bound to the rider, the trip fee lands in the part cost, and the customer never sees the supplier', async () => {
    const { number, orderItemId, po, supplier } = await confirmedPo();
    const riderA = await newRider('Mwangi');
    const riderB = await newRider('Njoroge');

    const created = await api('POST', '/admin/logistics/jobs/collection', dispatcher, { purchaseOrderNumber: po.number, riderId: riderA.id, urgency: 'URGENT' });
    expect(created.statusCode).toBe(201);
    const job = created.json().data;
    expect(job).toMatchObject({ type: 'COLLECTION', status: 'ASSIGNED', riderFeeCents: 250_00 });
    const codeA = job.collectionCode as string;
    expect(codeA).toMatch(/^\d{6}$/);
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe('RIDER_ASSIGNED');

    // Rider A can't make it → reassign before leaving. The old code dies with the old rider.
    const reassigned = await api('POST', `/admin/logistics/jobs/${job.number}/assign`, dispatcher, { riderId: riderB.id });
    const codeB = reassigned.json().data.collectionCode as string;
    expect(reassigned.json().data.rider.id).toBe(riderB.id);

    await api('POST', `/admin/logistics/jobs/${job.number}/start`, dispatcher);
    if (codeA !== codeB) {
      expect((await api('POST', `/admin/logistics/jobs/${job.number}/collected`, dispatcher, { code: codeA })).statusCode).toBe(400);
    }
    const collected = await api('POST', `/admin/logistics/jobs/${job.number}/collected`, dispatcher, { code: codeB });
    expect(collected.json().data.status).toBe('COLLECTED');
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe('COLLECTED');
    expect((await prisma.orderItem.findUniqueOrThrow({ where: { id: orderItemId } })).sourcingStatus).toBe('COLLECTED');

    expect((await api('POST', `/admin/logistics/jobs/${job.number}/arrived`, dispatcher)).json().data.status).toBe('AT_HUB');
    expect((await api('GET', `/admin/riders/${riderB.id}/earnings`, ops)).json().data.totalCents).toBe(250_00);
    expect((await api('GET', `/admin/riders/${riderA.id}/earnings`, ops)).json().data.totalCents).toBe(0);

    // GRN without a fee: the collection trip's rider fee is used automatically
    const grn = await api('POST', '/admin/grns', warehouse, {
      purchaseOrderNumber: po.number, lines: [{ purchaseOrderItemId: po.items[0].id, receivedQty: 1, acceptedQty: 1, checks: QC_OK }],
    });
    expect(grn.statusCode).toBe(201);
    expect((await prisma.orderItem.findUniqueOrThrow({ where: { id: orderItemId } })).unitCostCents).toBe(3_250_00);
    expect((await prisma.logisticsJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('CONFIRMED');
    expect((await order(number)).status).toBe('PICKING');

    const tracked = await track(number);
    expect(tracked.json().data.timeline.map((t: { text: string }) => t.text)).toEqual(
      expect.arrayContaining(['A MySpares rider is on the way to collect your part', 'Your part has been collected and is on its way to our hub']),
    );
    expect(tracked.body).not.toContain(supplier.name);
    expect(tracked.body).not.toContain('JOB-');
  });

  it('the collection code locks after 5 wrong attempts', async () => {
    const { po } = await confirmedPo();
    const rider = await newRider();
    const job = (await api('POST', '/admin/logistics/jobs/collection', dispatcher, { purchaseOrderNumber: po.number, riderId: rider.id })).json().data;
    await api('POST', `/admin/logistics/jobs/${job.number}/start`, dispatcher);

    const wrong = job.collectionCode === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++) {
      expect((await api('POST', `/admin/logistics/jobs/${job.number}/collected`, dispatcher, { code: wrong })).statusCode).toBe(400);
    }
    const locked = await api('POST', `/admin/logistics/jobs/${job.number}/collected`, dispatcher, { code: job.collectionCode });
    expect(locked.statusCode).toBe(403);
    expect(await prisma.outboxEvent.count({ where: { type: 'alert.collection_code_locked', aggregateId: po.id } })).toBe(1);

    // Recovery: the rider failed; a new job + rider gets a fresh code
    await api('POST', `/admin/logistics/jobs/${job.number}/fail`, dispatcher, { reason: 'Code locked at supplier' });
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe('CONFIRMED_BY_SUPPLIER');
    const retry = await api('POST', '/admin/logistics/jobs/collection', dispatcher, { purchaseOrderNumber: po.number, riderId: (await newRider()).id });
    expect(retry.json().data.collectionCode).toMatch(/^\d{6}$/);
  });
});
