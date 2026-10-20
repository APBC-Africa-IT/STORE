import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../src/app/build-app';
import { prisma } from '../../src/shared/db/prisma';
import { inventoryService } from '../../src/modules/inventory/inventory.routes';
import { staffToken } from '../helpers';

let app: FastifyInstance;
let warehouse: string;
let categoryId: string;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  warehouse = await staffToken(app, 'WAREHOUSE_STAFF');
  const cat = await prisma.category.create({ data: { name: `Inv ${randomUUID()}`, slug: `inv-${randomUUID()}` } });
  categoryId = cat.id;
});

afterAll(async () => {
  await app.close();
});

const call = (method: 'GET' | 'POST' | 'PUT', url: string, token?: string, payload?: object) =>
  app.inject({ method, url: `/api/v1${url}`, ...(payload ? { payload } : {}), headers: token ? { authorization: `Bearer ${token}` } : {} });

async function newProduct(overrides: Partial<{ isSourceable: boolean }> = {}) {
  const id = randomUUID().slice(0, 8);
  return prisma.product.create({
    data: {
      sku: `INV-${id}`, slug: `inv-${id}`, name: `Inventory test ${id}`, categoryId, status: 'ACTIVE',
      retailPriceCents: 100_000, lastCostCents: 50_000, sourcingLeadTimeMins: 120, ...overrides,
    },
  });
}

const adjust = (productId: string, quantity: number, reason: string, token = warehouse) =>
  call('POST', '/admin/inventory/adjustments', token, { productId, quantity, reason, note: 'test adjustment' });

describe('adjustments', () => {
  it('adds stock, records a movement, and refuses to go negative', async () => {
    const p = await newProduct();
    const add = await adjust(p.id, 5, 'OPENING_BALANCE');
    expect(add.statusCode).toBe(201);
    expect(add.json().data).toMatchObject({ onHand: 5, reserved: 0, available: 5 });

    const remove = await adjust(p.id, -2, 'ADJUSTMENT_DAMAGED');
    expect(remove.json().data.onHand).toBe(3);

    const tooMuch = await adjust(p.id, -10, 'ADJUSTMENT_STOLEN');
    expect(tooMuch.statusCode).toBe(409);
    expect(tooMuch.json().error.code).toBe('INSUFFICIENT_STOCK');

    const wrongReason = await adjust(p.id, 3, 'ADJUSTMENT_DAMAGED'); // "damaged" can't ADD stock
    expect(wrongReason.statusCode).toBe(400);

    const stock = await call('GET', `/admin/inventory/products/${p.id}`, warehouse);
    expect(stock.json().data.totals).toEqual({ onHand: 3, reserved: 0, available: 3 });
    expect(stock.json().data.movements.map((m: { reason: string }) => m.reason)).toEqual(['ADJUSTMENT_DAMAGED', 'OPENING_BALANCE']);

    const events = await prisma.outboxEvent.count({ where: { type: 'inventory.changed', aggregateId: p.id } });
    expect(events).toBe(2);
  });

  it('customers cannot adjust stock', async () => {
    const p = await newProduct();
    const customer = await call('POST', '/auth/register', undefined, {
      firstName: 'A', lastName: 'B', email: `inv-${randomUUID().slice(0, 6)}@test.local`, password: 'SuperSecret123',
    });
    const res = await adjust(p.id, 5, 'OPENING_BALANCE', customer.json().data.accessToken);
    expect(res.statusCode).toBe(403);
  });
});

describe('reservations', () => {
  it('reserve → release → reserve → commit keeps the numbers right', async () => {
    const p = await newProduct();
    await adjust(p.id, 5, 'OPENING_BALANCE');

    const r1 = await prisma.$transaction((tx) => inventoryService.reserve(tx, { productId: p.id, quantity: 2 }));
    let level = await prisma.inventoryLevel.findFirstOrThrow({ where: { productId: p.id } });
    expect([level.onHand, level.reserved]).toEqual([5, 2]);

    // Can't remove stock that is promised to an order
    expect((await adjust(p.id, -4, 'ADJUSTMENT_DAMAGED')).statusCode).toBe(409);

    await prisma.$transaction((tx) => inventoryService.release(tx, r1.id));
    expect(await prisma.$transaction((tx) => inventoryService.release(tx, r1.id))).toBe(false); // idempotent

    const r2 = await prisma.$transaction((tx) => inventoryService.reserve(tx, { productId: p.id, quantity: 3 }));
    await prisma.$transaction((tx) => inventoryService.commit(tx, r2.id, { referenceType: 'ORDER', referenceId: 'TEST-1' }));

    level = await prisma.inventoryLevel.findFirstOrThrow({ where: { productId: p.id } });
    expect([level.onHand, level.reserved]).toEqual([2, 0]);
    const sale = await prisma.stockMovement.findFirstOrThrow({ where: { productId: p.id, reason: 'SALE' } });
    expect(sale.quantity).toBe(-3);
  });

  it('LAST UNIT RACE: 20 simultaneous buyers, exactly 1 gets it', async () => {
    const p = await newProduct();
    await adjust(p.id, 1, 'OPENING_BALANCE');

    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        prisma.$transaction((tx) => inventoryService.reserve(tx, { productId: p.id, quantity: 1 }), { maxWait: 15_000, timeout: 15_000 }),
      ),
    );
    const won = attempts.filter((a) => a.status === 'fulfilled');
    const lost = attempts.filter((a) => a.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(19);

    const level = await prisma.inventoryLevel.findFirstOrThrow({ where: { productId: p.id } });
    expect([level.onHand, level.reserved]).toEqual([1, 1]); // never oversold
  });
});

describe('what customers see', () => {
  it('shows Available / Low Stock / Available to Order / Rare Part — and no stock numbers when plenty', async () => {
    const plenty = await newProduct();
    const few = await newProduct();
    const none = await newProduct();
    const rare = await newProduct({ isSourceable: false });
    await adjust(plenty.id, 10, 'OPENING_BALANCE');
    await adjust(few.id, 2, 'OPENING_BALANCE');

    const get = async (slug: string) => (await call('GET', `/products/${slug}`)).json().data.availability;

    const a = await get(plenty.slug);
    expect(a).toEqual({ status: 'AVAILABLE', label: 'Available — Order Now' }); // exact stock not revealed
    expect((await get(few.slug)).status).toBe('LOW_STOCK');
    expect((await get(none.slug)).status).toBe('AVAILABLE_TO_ORDER');
    expect((await get(rare.slug)).status).toBe('RARE_PART_REQUEST');
  });

  it('low-stock report lists products at or below their threshold', async () => {
    const few = await newProduct();
    await adjust(few.id, 1, 'OPENING_BALANCE');
    const res = await call('GET', '/admin/inventory/low-stock', warehouse);
    const row = res.json().data.find((r: { productId: string }) => r.productId === few.id);
    expect(row).toMatchObject({ available: 1, lowStockThreshold: 3 });
  });
});
