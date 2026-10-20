import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/db/prisma';
import { VehicleService } from './vehicles.service';
import {
  CreateMakeBody, CreateModelBody, CreateVehicleBody, MakesQuery, ModelsQuery, VariantsQuery,
} from './vehicles.schemas';

export async function vehicleRoutes(app: FastifyInstance) {
  const service = new VehicleService(prisma);

  // ── Public: Year → Make → Model → Variant cascade ──
  app.get('/vehicles/years', async () => ({ data: await service.years() }));

  app.get('/vehicles/makes', async (req) => {
    const q = MakesQuery.parse(req.query);
    return { data: await service.makes(q.year) };
  });

  app.get('/vehicles/models', async (req) => {
    const q = ModelsQuery.parse(req.query);
    return { data: await service.models(q.makeId, q.year) };
  });

  app.get('/vehicles/variants', async (req) => {
    const q = VariantsQuery.parse(req.query);
    return { data: await service.variants(q.modelId, q.year) };
  });

  // ── Admin ──
  const canWrite = { preHandler: [app.authenticate, app.requirePermission('catalog:write')] };

  app.post('/admin/vehicles/makes', canWrite, async (req, reply) => {
    const make = await service.createMake(CreateMakeBody.parse(req.body));
    return reply.status(201).send({ data: make });
  });

  app.post('/admin/vehicles/models', canWrite, async (req, reply) => {
    const model = await service.createModel(CreateModelBody.parse(req.body));
    return reply.status(201).send({ data: model });
  });

  app.post('/admin/vehicles', canWrite, async (req, reply) => {
    const vehicle = await service.createVehicle(CreateVehicleBody.parse(req.body));
    return reply.status(201).send({ data: vehicle });
  });
}
