import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/db/prisma';
import { actorFrom, can } from '../../shared/auth/actor';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';
import { AdjustmentBody, BinCreateBody, MovementsQuery, SetBinBody } from './inventory.schemas';

export const inventoryService = new InventoryService(new InventoryRepository(prisma));

const ProductParams = z.object({ productId: z.uuid() });

export async function inventoryRoutes(app: FastifyInstance) {
  const service = inventoryService;
  const canView = { preHandler: [app.authenticate, app.requirePermission('inventory:view')] };
  const canAdjust = { preHandler: [app.authenticate, app.requirePermission('inventory:adjust')] };

  app.get('/admin/inventory/summary', canView, async (req) => ({
    data: await service.summary(can(actorFrom(req), 'pricing:view_cost')),
  }));

  app.get('/admin/inventory/low-stock', canView, async () => ({ data: await service.lowStock() }));

  app.get('/admin/inventory/products/:productId', canView, async (req) => {
    const { productId } = ProductParams.parse(req.params);
    return { data: await service.productStock(productId) };
  });

  app.get('/admin/inventory/movements', canView, async (req) => {
    const { items, page } = await service.movements(MovementsQuery.parse(req.query));
    return { data: items, page };
  });

  app.post('/admin/inventory/adjustments', canAdjust, async (req, reply) => {
    const result = await service.adjust(AdjustmentBody.parse(req.body), actorFrom(req));
    return reply.status(201).send({ data: result });
  });

  // Bins (shelf locations like A-03-B2)
  app.get('/admin/bins', canView, async () => ({ data: await service.listBins() }));

  app.post('/admin/bins', canAdjust, async (req, reply) => {
    const { code } = BinCreateBody.parse(req.body);
    return reply.status(201).send({ data: await service.createBin(code) });
  });

  app.put('/admin/inventory/products/:productId/bin', canAdjust, async (req) => {
    const { productId } = ProductParams.parse(req.params);
    const { binId } = SetBinBody.parse(req.body);
    return { data: await service.setBin(productId, binId) };
  });
}
