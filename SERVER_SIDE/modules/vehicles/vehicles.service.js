/**
 * Vehicles service — YMM cascade, VIN/chassis decode, My Garage management.
 * Data is imported from TecDoc/AutoSync; the service itself never queries the provider
 * on the hot path — it reads from our own vehicle tables.
 */
import { prisma } from '../../shared/db/prisma.js';
import { redis } from '../../shared/db/redis.js';
import { AppError } from '../../shared/errors/codes.js';

const CACHE_TTL = 86400; // 24 h — vehicle data changes only on import

// ── YMM cascade ────────────────────────────────────────────────────────────

export async function getYears() {
  const cached = await redis.get('vehicles:years').catch(() => null);
  if (cached) return JSON.parse(cached);

  const rows = await prisma.$queryRaw`
    SELECT DISTINCT year_from AS year FROM vehicles
    UNION
    SELECT DISTINCT year_to   AS year FROM vehicles
    ORDER BY year DESC
  `;
  const years = [...new Set(rows.map(r => r.year))].sort((a, b) => b - a);
  await redis.setex('vehicles:years', CACHE_TTL, JSON.stringify(years)).catch(() => {});
  return years;
}

export async function getMakesForYear(year) {
  const key = `vehicles:makes:${year}`;
  const cached = await redis.get(key).catch(() => null);
  if (cached) return JSON.parse(cached);

  const makes = await prisma.vehicleMake.findMany({
    where: {
      models: {
        some: {
          vehicles: { some: { yearFrom: { lte: Number(year) }, yearTo: { gte: Number(year) } } },
        },
      },
    },
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' },
  });
  await redis.setex(key, CACHE_TTL, JSON.stringify(makes)).catch(() => {});
  return makes;
}

export async function getModelsForMakeYear(makeId, year) {
  const key = `vehicles:models:${makeId}:${year}`;
  const cached = await redis.get(key).catch(() => null);
  if (cached) return JSON.parse(cached);

  const models = await prisma.vehicleModel.findMany({
    where: {
      makeId,
      vehicles: { some: { yearFrom: { lte: Number(year) }, yearTo: { gte: Number(year) } } },
    },
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' },
  });
  await redis.setex(key, CACHE_TTL, JSON.stringify(models)).catch(() => {});
  return models;
}

export async function getVariantsForModelYear(modelId, year) {
  const key = `vehicles:variants:${modelId}:${year}`;
  const cached = await redis.get(key).catch(() => null);
  if (cached) return JSON.parse(cached);

  const variants = await prisma.vehicle.findMany({
    where: {
      modelId,
      yearFrom: { lte: Number(year) },
      yearTo:   { gte: Number(year) },
    },
    select: { id: true, engine: true, variant: true, yearFrom: true, yearTo: true },
    orderBy: { variant: 'asc' },
  });
  await redis.setex(key, CACHE_TTL, JSON.stringify(variants)).catch(() => {});
  return variants;
}

// ── VIN / Chassis decode ──────────────────────────────────────────────────

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/i;
const CHASSIS_REGEX = /^[A-Z0-9]{6,20}$/i; // Japanese chassis numbers vary

export async function decodeVin(vin) {
  const normalized = vin.trim().toUpperCase();

  // Check cache first
  const cacheKey = `vin:${normalized}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached);

  // Validate format
  if (!VIN_REGEX.test(normalized) && !CHASSIS_REGEX.test(normalized)) {
    throw new AppError('VALIDATION_FAILED', 'Invalid VIN or chassis number format');
  }

  // Look up in our imported vehicle data by vinPattern or externalRef
  const vehicles = await prisma.vehicle.findMany({
    where: {
      OR: [
        { vinPattern: { contains: normalized.slice(0, 8) } },
        { externalRef: normalized },
      ],
    },
    include: { model: { include: { make: true } } },
    take: 5,
  });

  const result = {
    vin: normalized,
    matches: vehicles.map(v => ({
      vehicleId: v.id,
      make:    v.model.make.name,
      model:   v.model.name,
      yearFrom: v.yearFrom,
      yearTo:   v.yearTo,
      engine:  v.engine,
      variant: v.variant,
    })),
    source: 'local',
  };

  // If we have an external provider integration, call it (fake mode skips)
  const mode = process.env.INTEGRATIONS_MODE || 'fake';
  if (mode === 'live' && result.matches.length === 0) {
    // TODO: Call TecDoc/AutoSync adapter here and store results
  }

  await redis.setex(cacheKey, 3600, JSON.stringify(result)).catch(() => {});
  return result;
}

// ── My Garage ─────────────────────────────────────────────────────────────

const MAX_GARAGE_VEHICLES = 10;

export async function getGarage(userId) {
  return prisma.garageVehicle.findMany({
    where: { userId },
    include: { vehicle: { include: { model: { include: { make: true } } } } },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function addToGarage(userId, { vehicleId, year, vin, nickname }) {
  const count = await prisma.garageVehicle.count({ where: { userId } });
  if (count >= MAX_GARAGE_VEHICLES) {
    throw new AppError('CONFLICT', `Garage is full — maximum ${MAX_GARAGE_VEHICLES} vehicles allowed`);
  }

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) throw new AppError('NOT_FOUND', 'Vehicle not found');

  return prisma.garageVehicle.create({
    data: { userId, vehicleId, year: Number(year), vin: vin || null, nickname: nickname || null },
    include: { vehicle: { include: { model: { include: { make: true } } } } },
  });
}

export async function updateGarageVehicle(userId, garageId, data) {
  const gv = await prisma.garageVehicle.findFirst({ where: { id: garageId, userId } });
  if (!gv) throw new AppError('NOT_FOUND', 'Garage vehicle not found');
  return prisma.garageVehicle.update({
    where: { id: garageId },
    data: { nickname: data.nickname, vin: data.vin },
  });
}

export async function removeFromGarage(userId, garageId) {
  const gv = await prisma.garageVehicle.findFirst({ where: { id: garageId, userId } });
  if (!gv) throw new AppError('NOT_FOUND', 'Garage vehicle not found');
  await prisma.garageVehicle.delete({ where: { id: garageId } });
}

export async function setActiveGarageVehicle(userId, garageId) {
  const gv = await prisma.garageVehicle.findFirst({ where: { id: garageId, userId } });
  if (!gv) throw new AppError('NOT_FOUND', 'Garage vehicle not found');

  await prisma.$transaction([
    prisma.garageVehicle.updateMany({ where: { userId }, data: { isActive: false } }),
    prisma.garageVehicle.update({ where: { id: garageId }, data: { isActive: true } }),
  ]);
}

// ── Admin: vehicle data CRUD ──────────────────────────────────────────────

export async function createMake(data, actor) {
  return prisma.vehicleMake.create({ data: { name: data.name, slug: data.slug } });
}

export async function createModel(data, actor) {
  return prisma.vehicleModel.create({
    data: { makeId: data.makeId, name: data.name, slug: data.slug },
  });
}

export async function upsertVehicle(data, actor) {
  const { makeId, modelId, yearFrom, yearTo, engine, variant, externalRef, vinPattern } = data;
  if (externalRef) {
    return prisma.vehicle.upsert({
      where: { externalRef },
      update: { yearFrom, yearTo, engine, variant, vinPattern },
      create: { modelId, yearFrom, yearTo, engine, variant, externalRef, vinPattern },
    });
  }
  return prisma.vehicle.create({ data: { modelId, yearFrom, yearTo, engine, variant, vinPattern } });
}

export async function invalidateVehicleCache() {
  const keys = await redis.keys('vehicles:*');
  if (keys.length > 0) await redis.del(...keys);
}
