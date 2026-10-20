import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error';
import { slugify } from '../../shared/text';
import type { CreateMakeBody, CreateModelBody, CreateVehicleBody } from './vehicles.schemas';

const yearFilter = (year?: number) => (year ? { yearFrom: { lte: year }, yearTo: { gte: year } } : {});

export class VehicleService {
  constructor(private readonly db: PrismaClient) {}

  /** All model years we have vehicles for, newest first. */
  async years(): Promise<number[]> {
    const agg = await this.db.vehicle.aggregate({ _min: { yearFrom: true }, _max: { yearTo: true } });
    const from = agg._min.yearFrom;
    const to = agg._max.yearTo;
    if (from == null || to == null) return [];
    return Array.from({ length: to - from + 1 }, (_, i) => to - i);
  }

  makes(year?: number) {
    return this.db.vehicleMake.findMany({
      where: year ? { models: { some: { vehicles: { some: yearFilter(year) } } } } : {},
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    });
  }

  models(makeId: string, year?: number) {
    return this.db.vehicleModel.findMany({
      where: { makeId, ...(year ? { vehicles: { some: yearFilter(year) } } : {}) },
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    });
  }

  async variants(modelId: string, year?: number) {
    const rows = await this.db.vehicle.findMany({
      where: { modelId, ...yearFilter(year) },
      include: { model: { include: { make: true } } },
      orderBy: [{ yearFrom: 'desc' }, { engine: 'asc' }],
    });
    return rows.map(toVehicleDto);
  }

  async createMake(input: z.infer<typeof CreateMakeBody>) {
    return this.db.vehicleMake.create({ data: { name: input.name, slug: slugify(input.name) } });
  }

  async createModel(input: z.infer<typeof CreateModelBody>) {
    const make = await this.db.vehicleMake.findUnique({ where: { id: input.makeId } });
    if (!make) throw new AppError('NOT_FOUND', 'Make not found');
    return this.db.vehicleModel.create({ data: { makeId: make.id, name: input.name, slug: slugify(input.name) } });
  }

  async createVehicle(input: z.infer<typeof CreateVehicleBody>) {
    const model = await this.db.vehicleModel.findUnique({ where: { id: input.modelId } });
    if (!model) throw new AppError('NOT_FOUND', 'Model not found');
    const v = await this.db.vehicle.create({
      data: {
        modelId: model.id,
        yearFrom: input.yearFrom,
        yearTo: input.yearTo,
        engine: input.engine ?? null,
        variant: input.variant ?? null,
      },
      include: { model: { include: { make: true } } },
    });
    return toVehicleDto(v);
  }
}

type VehicleWithModel = {
  id: string;
  yearFrom: number;
  yearTo: number;
  engine: string | null;
  variant: string | null;
  model: { name: string; make: { name: string } };
};

export function toVehicleDto(v: VehicleWithModel) {
  const years = v.yearFrom === v.yearTo ? `${v.yearFrom}` : `${v.yearFrom}–${v.yearTo}`;
  return {
    id: v.id,
    make: v.model.make.name,
    model: v.model.name,
    yearFrom: v.yearFrom,
    yearTo: v.yearTo,
    engine: v.engine,
    variant: v.variant,
    label: [v.model.make.name, v.model.name, years, v.engine, v.variant].filter(Boolean).join(' '),
  };
}
