import { z } from 'zod';

const year = z.coerce.number().int().min(1950).max(new Date().getFullYear() + 1);

export const MakesQuery = z.object({ year: year.optional() });
export const ModelsQuery = z.object({ makeId: z.uuid(), year: year.optional() });
export const VariantsQuery = z.object({ modelId: z.uuid(), year: year.optional() });

export const CreateMakeBody = z.object({ name: z.string().trim().min(1).max(60) });
export const CreateModelBody = z.object({ makeId: z.uuid(), name: z.string().trim().min(1).max(60) });
export const CreateVehicleBody = z
  .object({
    modelId: z.uuid(),
    yearFrom: year,
    yearTo: year,
    engine: z.string().trim().max(80).optional(),
    variant: z.string().trim().max(80).optional(),
  })
  .refine((v) => v.yearFrom <= v.yearTo, { message: 'yearFrom must be ≤ yearTo', path: ['yearTo'] });
