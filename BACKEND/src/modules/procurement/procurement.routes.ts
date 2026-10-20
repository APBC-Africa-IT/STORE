import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/db/prisma';
import { actorFrom } from '../../shared/auth/actor';
import { inventoryService } from '../inventory/inventory.routes';
import { ordersService } from '../orders/orders.routes';
import { SuppliersService } from './suppliers.service';
import { PurchaseOrdersService, type PoWithDetails } from './purchase-orders.service';
import { GrnService } from './grn.service';
import { renderPurchaseOrder } from './po.document';
import {
  CancelPoBody, CandidatesQuery, CatalogBody, GrnBody, PoListQuery, ReactivePoBody, RestockPoBody, SendPoBody,
  SupplierBody, SupplierResponseBody, SupplierStatusBody, SupplierUpdateBody,
} from './procurement.schemas';

export const suppliersService = new SuppliersService(prisma);
export const purchaseOrdersService = new PurchaseOrdersService(prisma, ordersService);
export const grnService = new GrnService(prisma, inventoryService, ordersService, purchaseOrdersService);

const IdParams = z.object({ id: z.uuid() });
const PoParams = z.object({ number: z.string().regex(/^PO-\d{4}-\d{5,}$/) });

/** Never send the collection-code hash anywhere. */
function toPoDto(po: PoWithDetails) {
  const { collectionCodeHash: _hidden, ...rest } = po;
  return { ...rest, hasCollectionCode: Boolean(po.collectionCodeHash) };
}

export async function procurementRoutes(app: FastifyInstance) {
  const guard = (permission: Parameters<typeof app.requirePermission>[0]) => ({
    preHandler: [app.authenticate, app.requirePermission(permission)],
  });

  // ═════ Suppliers ═════
  app.get('/admin/suppliers', guard('procurement:manage_suppliers'), async (req) => {
    const q = z.object({ status: z.string().optional(), q: z.string().optional() }).parse(req.query);
    return { data: await suppliersService.list(q) };
  });
  app.post('/admin/suppliers', guard('procurement:manage_suppliers'), async (req, reply) => {
    return reply.status(201).send({ data: await suppliersService.create(SupplierBody.parse(req.body)) });
  });
  app.get('/admin/suppliers/:id', guard('procurement:manage_suppliers'), async (req) => {
    return { data: await suppliersService.get(IdParams.parse(req.params).id) };
  });
  app.patch('/admin/suppliers/:id', guard('procurement:manage_suppliers'), async (req) => {
    return { data: await suppliersService.update(IdParams.parse(req.params).id, SupplierUpdateBody.parse(req.body)) };
  });
  app.post('/admin/suppliers/:id/status', guard('procurement:manage_suppliers'), async (req) => {
    return { data: await suppliersService.setStatus(IdParams.parse(req.params).id, SupplierStatusBody.parse(req.body), actorFrom(req)) };
  });
  app.get('/admin/suppliers/:id/catalog', guard('procurement:manage_suppliers'), async (req) => {
    return { data: await suppliersService.catalog(IdParams.parse(req.params).id) };
  });
  app.put('/admin/suppliers/:id/catalog', guard('procurement:manage_suppliers'), async (req) => {
    return { data: await suppliersService.upsertCatalog(IdParams.parse(req.params).id, CatalogBody.parse(req.body)) };
  });

  // ═════ Sourcing ═════
  app.get('/admin/sourcing/queue', guard('procurement:create_po'), async () => ({ data: await purchaseOrdersService.sourcingQueue() }));
  app.get('/admin/sourcing/candidates', guard('procurement:create_po'), async (req) => {
    return { data: await suppliersService.candidates(CandidatesQuery.parse(req.query).productId) };
  });

  // ═════ Purchase orders ═════
  app.get('/admin/purchase-orders', guard('procurement:create_po'), async (req) => {
    const { items, page } = await purchaseOrdersService.list(PoListQuery.parse(req.query));
    return { data: items, page };
  });
  app.get('/admin/purchase-orders/:number', guard('procurement:create_po'), async (req) => {
    return { data: toPoDto(await purchaseOrdersService.detail(PoParams.parse(req.params).number)) };
  });
  app.post('/admin/purchase-orders/reactive', guard('procurement:create_po'), async (req, reply) => {
    const po = await purchaseOrdersService.createReactive(ReactivePoBody.parse(req.body), actorFrom(req));
    return reply.status(201).send({ data: toPoDto(po) });
  });
  app.post('/admin/purchase-orders/restock', guard('procurement:create_po'), async (req, reply) => {
    const po = await purchaseOrdersService.createRestock(RestockPoBody.parse(req.body), actorFrom(req));
    return reply.status(201).send({ data: toPoDto(po) });
  });
  app.post('/admin/purchase-orders/:number/submit', guard('procurement:create_po'), async (req) => {
    return { data: toPoDto(await purchaseOrdersService.submitForApproval(PoParams.parse(req.params).number)) };
  });
  app.post('/admin/purchase-orders/:number/approve', guard('procurement:approve_restock'), async (req) => {
    return { data: toPoDto(await purchaseOrdersService.approve(PoParams.parse(req.params).number, actorFrom(req))) };
  });
  app.post('/admin/purchase-orders/:number/send', guard('procurement:send_po'), async (req) => {
    const { channel } = SendPoBody.parse(req.body);
    return { data: toPoDto(await purchaseOrdersService.send(PoParams.parse(req.params).number, channel, actorFrom(req))) };
  });
  app.post('/admin/purchase-orders/:number/supplier-response', guard('procurement:send_po'), async (req) => {
    const { po, collectionCode } = await purchaseOrdersService.recordSupplierResponse(
      PoParams.parse(req.params).number, SupplierResponseBody.parse(req.body), actorFrom(req),
    );
    return { data: { ...toPoDto(po), collectionCode } };
  });
  app.post('/admin/purchase-orders/:number/cancel', guard('procurement:create_po'), async (req) => {
    return { data: toPoDto(await purchaseOrdersService.cancel(PoParams.parse(req.params).number, CancelPoBody.parse(req.body), actorFrom(req))) };
  });
  app.get('/admin/purchase-orders/:number/pdf', guard('procurement:create_po'), async (req, reply) => {
    const po = await purchaseOrdersService.detail(PoParams.parse(req.params).number);
    return reply.type('application/pdf').header('content-disposition', `inline; filename="${po.number}.pdf"`).send(await renderPurchaseOrder(po));
  });

  // ═════ Goods received ═════
  app.post('/admin/grns', guard('procurement:receive_goods'), async (req, reply) => {
    return reply.status(201).send({ data: await grnService.receive(GrnBody.parse(req.body), actorFrom(req)) });
  });
  app.get('/admin/grns', guard('procurement:receive_goods'), async (req) => {
    const { po } = z.object({ po: z.string().optional() }).parse(req.query);
    return { data: await grnService.list(po) };
  });
}
