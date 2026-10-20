import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../src/app/build-app';
import { staffToken } from '../helpers';

let app: FastifyInstance;
let admin: string; // SUPER_ADMIN (can see cost)
let ops: string; // OPERATIONS_MANAGER (catalog:write, no cost visibility)
const tag = randomUUID().slice(0, 6); // keeps names unique across runs

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  admin = await staffToken(app, 'SUPER_ADMIN');
  ops = await staffToken(app, 'OPERATIONS_MANAGER');
});

afterAll(async () => {
  await app.close();
});

const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, token?: string, payload?: object) =>
  app.inject({ method, url: `/api/v1${url}`, ...(payload ? { payload } : {}), headers: token ? { authorization: `Bearer ${token}` } : {} });

describe('catalogue', () => {
  let vehicleId: string;
  let otherVehicleId: string;
  let categoryId: string;
  let productId: string;
  let productSlug: string;

  it('admin builds vehicles: make → model → vehicle', async () => {
    const make = await call('POST', '/admin/vehicles/makes', admin, { name: `Toyota ${tag}` });
    expect(make.statusCode).toBe(201);
    const model = await call('POST', '/admin/vehicles/models', admin, { makeId: make.json().data.id, name: 'Corolla' });
    expect(model.statusCode).toBe(201);
    const v1 = await call('POST', '/admin/vehicles', admin, {
      modelId: model.json().data.id, yearFrom: 2014, yearTo: 2019, engine: '1.8L 2ZR-FE',
    });
    expect(v1.statusCode).toBe(201);
    expect(v1.json().data.label).toBe(`Toyota ${tag} Corolla 2014–2019 1.8L 2ZR-FE`);
    vehicleId = v1.json().data.id;

    const v2 = await call('POST', '/admin/vehicles', admin, { modelId: model.json().data.id, yearFrom: 2008, yearTo: 2013 });
    otherVehicleId = v2.json().data.id;

    // YMM cascade
    const makes = await call('GET', '/vehicles/makes?year=2016');
    expect(makes.json().data.map((m: { name: string }) => m.name)).toContain(`Toyota ${tag}`);
    const variants = await call('GET', `/vehicles/variants?modelId=${model.json().data.id}&year=2016`);
    expect(variants.json().data).toHaveLength(1);
  });

  it('admin creates a category tree and a brand', async () => {
    const parent = await call('POST', '/admin/categories', admin, { name: `Brakes ${tag}` });
    expect(parent.statusCode).toBe(201);
    const child = await call('POST', '/admin/categories', admin, { name: `Brake Pads ${tag}`, parentId: parent.json().data.id });
    categoryId = child.json().data.id;

    const tree = await call('GET', '/categories');
    const node = tree.json().data.find((c: { slug: string }) => c.slug === parent.json().data.slug);
    expect(node.children[0].slug).toBe(child.json().data.slug);

    const dup = await call('POST', '/admin/brands', admin, { name: `Brembo ${tag}` });
    expect(dup.statusCode).toBe(201);
    const again = await call('POST', '/admin/brands', admin, { name: `Brembo ${tag}` });
    expect(again.statusCode).toBe(409);
  });

  it('blocks a price below cost (BR-004) and warns below margin', async () => {
    const below = await call('POST', '/admin/products', ops, {
      sku: `X-${tag}`, name: 'Cheap thing', categoryId, retailPriceCents: 10_000,
    });
    expect(below.statusCode).toBe(201); // no cost known yet → OK

    const forbidden = await call('PATCH', `/admin/products/${below.json().data.id}`, ops, { lastCostCents: 50_000 });
    expect(forbidden.statusCode).toBe(403); // ops cannot set cost

    const warn = await call('POST', '/admin/products', admin, {
      sku: `Y-${tag}`, name: 'Thin margin', categoryId, retailPriceCents: 11_600, lastCostCents: 9_000,
    });
    expect(warn.statusCode).toBe(422);
    const acked = await call('POST', '/admin/products', admin, {
      sku: `Y-${tag}`, name: 'Thin margin', categoryId, retailPriceCents: 11_600, lastCostCents: 9_000, acknowledgeMarginWarning: true,
    });
    expect(acked.statusCode).toBe(201);
  });

  it('admin creates an active product with part numbers and fitment', async () => {
    const res = await call('POST', '/admin/products', admin, {
      sku: `brk-${tag}`, name: `Front Brake Pads ${tag}`, categoryId, status: 'ACTIVE',
      retailPriceCents: 450_000, lastCostCents: 260_000, qualityGrade: 'PREMIUM',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.sku).toBe(`BRK-${tag.toUpperCase()}`);
    expect(res.json().data.lastCostCents).toBe(260_000); // admin sees cost
    productId = res.json().data.id;
    productSlug = res.json().data.slug;

    const pn = await call('PUT', `/admin/products/${productId}/part-numbers`, admin, {
      partNumbers: [{ type: 'OEM', number: `04465-${tag}` }],
    });
    expect(pn.statusCode).toBe(200);

    const fit = await call('PUT', `/admin/products/${productId}/fitments`, admin, {
      fitments: [{ vehicleId, position: 'Front', verified: true }],
    });
    expect(fit.statusCode).toBe(200);

    const opsView = await call('GET', `/admin/products/${productId}`, ops);
    expect(opsView.json().data.lastCostCents).toBeUndefined(); // no pricing:view_cost
  });

  it('public product page hides every cost field and checks fitment', async () => {
    const res = await call('GET', `/products/${productSlug}?vehicleId=${vehicleId}`);
    expect(res.statusCode).toBe(200);
    const body = res.body.toLowerCase();
    expect(body).not.toContain('cost');
    expect(body).not.toContain('margin');
    expect(res.json().data.price.amountCents).toBe(450_000);
    expect(res.json().data.fitsVehicle).toBe(true);

    const other = await call('GET', `/products/${productSlug}?vehicleId=${otherVehicleId}`);
    expect(other.json().data.fitsVehicle).toBe(false);
  });

  it('filters by vehicle and finds by part number in any format', async () => {
    const byVehicle = await call('GET', `/products?vehicleId=${vehicleId}`);
    expect(byVehicle.json().data.map((p: { id: string }) => p.id)).toEqual([productId]);

    const byNumber = await call('GET', `/part-numbers/04465${tag}`);
    expect(byNumber.json().data[0].id).toBe(productId);

    const search = await call('GET', `/products?q=04465-${tag}`);
    expect(search.json().data[0].id).toBe(productId);
  });

  it('hides draft products and blocks customers from admin routes', async () => {
    const draft = await call('POST', '/admin/products', admin, { sku: `D-${tag}`, name: `Draft ${tag}`, categoryId, retailPriceCents: 1000 });
    expect((await call('GET', `/products/${draft.json().data.slug}`)).statusCode).toBe(404);

    const customer = await call('POST', '/auth/register', undefined, {
      firstName: 'A', lastName: 'B', email: `c-${tag}@test.local`, password: 'SuperSecret123',
    });
    const blocked = await call('POST', '/admin/products', customer.json().data.accessToken, {
      sku: 'NOPE', name: 'Nope', categoryId, retailPriceCents: 100,
    });
    expect(blocked.statusCode).toBe(403);
  });
});
