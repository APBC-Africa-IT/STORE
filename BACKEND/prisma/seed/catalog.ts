import type { PrismaClient } from '@prisma/client';
import { normalizePartNumber, slugify } from '../../src/shared/text';

// Demo data for local development. Safe to re-run (everything is upserted).

const CATEGORIES: Array<[name: string, children: string[]]> = [
  ['Engine Parts', ['Filters', 'Spark Plugs & Ignition', 'Belts & Timing']],
  ['Brakes', ['Brake Pads', 'Brake Discs']],
  ['Suspension', ['Shock Absorbers', 'Bushes & Mounts']],
  ['Electrical', ['Batteries', 'Lighting']],
  ['Body Parts', []],
  ['Tyres & Wheels', []],
  ['Fluids & Maintenance', []],
  ['Tools', []],
  ['Industrial Parts', []],
];

const BRANDS = ['Toyota Genuine', 'Bosch', 'Denso', 'NGK', 'Brembo', 'KYB', 'Sakura'];

const VEHICLES: Array<{ make: string; model: string; yearFrom: number; yearTo: number; engine: string; variant?: string }> = [
  { make: 'Toyota', model: 'Corolla', yearFrom: 2014, yearTo: 2019, engine: '1.8L 2ZR-FE Petrol', variant: 'E170' },
  { make: 'Toyota', model: 'Probox', yearFrom: 2002, yearTo: 2014, engine: '1.5L 1NZ-FE Petrol', variant: 'NCP50' },
  { make: 'Toyota', model: 'Fielder', yearFrom: 2012, yearTo: 2020, engine: '1.5L 1NZ-FE Petrol', variant: 'NZE161' },
  { make: 'Nissan', model: 'Note', yearFrom: 2012, yearTo: 2020, engine: '1.2L HR12DE Petrol', variant: 'E12' },
  { make: 'Subaru', model: 'Forester', yearFrom: 2013, yearTo: 2018, engine: '2.0L FB20 Petrol', variant: 'SJ' },
  { make: 'Mazda', model: 'Demio', yearFrom: 2014, yearTo: 2020, engine: '1.3L P3-VPS Petrol', variant: 'DJ' },
];

const PRODUCTS = [
  {
    sku: 'BRK-PAD-COR-F', name: 'Front Brake Pad Set — Toyota Corolla / Fielder', category: 'brake-pads', brand: 'brembo',
    retail: 4_500_00, cost: 2_600_00, grade: 'PREMIUM' as const, origin: 'AFTERMARKET' as const,
    partNumbers: [{ type: 'OEM' as const, number: '04465-02220' }, { type: 'AFTERMARKET' as const, number: 'P 83 152' }],
    fits: ['Corolla', 'Fielder'], position: 'Front',
  },
  {
    sku: 'FLT-OIL-1NZ', name: 'Oil Filter — Toyota 1NZ / 2ZR engines', category: 'filters', brand: 'toyota-genuine',
    retail: 850_00, cost: 420_00, grade: 'STANDARD' as const, origin: 'OEM' as const,
    partNumbers: [{ type: 'OEM' as const, number: '90915-YZZE1' }],
    fits: ['Corolla', 'Probox', 'Fielder'],
  },
  {
    sku: 'SPK-NGK-ILKAR7', name: 'Iridium Spark Plug (each)', category: 'spark-plugs-ignition', brand: 'ngk',
    retail: 1_200_00, cost: 650_00, grade: 'PREMIUM' as const, origin: 'OES' as const,
    partNumbers: [{ type: 'AFTERMARKET' as const, number: 'ILKAR7B11' }, { type: 'OEM' as const, number: '90919-01253' }],
    fits: ['Corolla', 'Fielder', 'Probox'],
  },
  {
    sku: 'SHK-KYB-NOTE-F', name: 'Front Shock Absorber — Nissan Note E12', category: 'shock-absorbers', brand: 'kyb',
    retail: 7_800_00, cost: 4_900_00, grade: 'STANDARD' as const, origin: 'AFTERMARKET' as const,
    partNumbers: [{ type: 'AFTERMARKET' as const, number: '339391' }],
    fits: ['Note'], position: 'Front',
  },
  {
    sku: 'FLT-AIR-FOR', name: 'Air Filter — Subaru Forester SJ', category: 'filters', brand: 'sakura',
    retail: 1_650_00, cost: 900_00, grade: 'ECONOMY' as const, origin: 'AFTERMARKET' as const,
    partNumbers: [{ type: 'OEM' as const, number: '16546-AA120' }],
    fits: ['Forester'],
  },
];

export async function seedCatalog(prisma: PrismaClient) {
  // Categories
  let order = 0;
  for (const [name, children] of CATEGORIES) {
    const parent = await prisma.category.upsert({
      where: { slug: slugify(name) }, update: {}, create: { name, slug: slugify(name), sortOrder: order++ },
    });
    for (const child of children) {
      await prisma.category.upsert({
        where: { slug: slugify(child) }, update: {}, create: { name: child, slug: slugify(child), parentId: parent.id },
      });
    }
  }

  // Brands
  for (const name of BRANDS) {
    await prisma.brand.upsert({ where: { slug: slugify(name) }, update: {}, create: { name, slug: slugify(name) } });
  }

  // Vehicles
  const vehicleIdsByModel = new Map<string, string>();
  for (const v of VEHICLES) {
    const make = await prisma.vehicleMake.upsert({
      where: { slug: slugify(v.make) }, update: {}, create: { name: v.make, slug: slugify(v.make) },
    });
    const model = await prisma.vehicleModel.upsert({
      where: { makeId_slug: { makeId: make.id, slug: slugify(v.model) } },
      update: {},
      create: { makeId: make.id, name: v.model, slug: slugify(v.model) },
    });
    const ref = `seed:${slugify(`${v.make}-${v.model}-${v.yearFrom}-${v.engine}`)}`;
    const vehicle = await prisma.vehicle.upsert({
      where: { externalRef: ref },
      update: {},
      create: { modelId: model.id, yearFrom: v.yearFrom, yearTo: v.yearTo, engine: v.engine, variant: v.variant ?? null, externalRef: ref },
    });
    vehicleIdsByModel.set(v.model, vehicle.id);
  }

  // Products
  for (const p of PRODUCTS) {
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: p.category } });
    const brand = await prisma.brand.findUniqueOrThrow({ where: { slug: p.brand } });
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        sku: p.sku, slug: slugify(p.name), name: p.name, status: 'ACTIVE',
        categoryId: category.id, brandId: brand.id, qualityGrade: p.grade, origin: p.origin,
        retailPriceCents: p.retail, lastCostCents: p.cost, avgCostCents: p.cost,
        warrantyText: '6 months against manufacturing defects',
      },
    });
    await prisma.partNumber.deleteMany({ where: { productId: product.id } });
    await prisma.partNumber.createMany({
      data: p.partNumbers.map((pn) => ({ ...pn, productId: product.id, normalized: normalizePartNumber(pn.number) })),
    });
    await prisma.productFitment.deleteMany({ where: { productId: product.id } });
    await prisma.productFitment.createMany({
      data: p.fits.map((model) => ({
        productId: product.id, vehicleId: vehicleIdsByModel.get(model)!, position: p.position ?? null, verified: true,
      })),
    });
  }

  console.log(`✔ demo catalogue: ${PRODUCTS.length} products, ${VEHICLES.length} vehicles, ${BRANDS.length} brands`);
}
