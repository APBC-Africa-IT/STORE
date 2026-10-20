import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DeliveryMethod, OrderChannel, OrderStatus, PaymentStatus } from '@prisma/client';
import { prisma } from '../../shared/db/prisma';
import { actorFrom, can } from '../../shared/auth/actor';
import { inventoryService } from '../inventory/inventory.routes';
import { paymentsService } from '../payments/payments.routes';
import { ordersService } from './orders.routes';
import { FulfilmentService } from './fulfilment.service';
import { toStaffOrder, toStaffOrderRow } from './orders.serializers';
import { OrderNumberParams } from './orders.schemas';
import { renderLabel, renderPackingSlip } from './order.documents';

export const fulfilmentService = new FulfilmentService(prisma, ordersService, inventoryService);

const ListQuery = z.object({
  status: z.enum(OrderStatus).optional(),
  channel: z.enum(OrderChannel).optional(),
  paymentStatus: z.enum(PaymentStatus).optional(),
  deliveryMethod: z.enum(DeliveryMethod).optional(),
  q: z.string().trim().min(2).max(60).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});

// Packing checklist: every box must be ticked (SRS §2.3 step 5 — quality check before packing).
const PackBody = z.object({
  checks: z.object({
    correctParts: z.literal(true, { error: 'Confirm the parts match the order' }),
    noDamage: z.literal(true, { error: 'Confirm the parts are not damaged' }),
    brandedPackaging: z.literal(true, { error: 'Confirm MySpares packaging and label are used' }),
  }),
});
const ReasonBody = z.object({ reason: z.string().trim().min(3).max(300) });
const NoteBody = z.object({ body: z.string().trim().min(1).max(2000) });
const ManualPaymentBody = z.object({
  method: z.enum(['CASH', 'CARD_POS_TERMINAL', 'BANK_TRANSFER']),
  amountCents: z.number().int().positive(),
  reference: z.string().trim().min(3).max(60).optional(),
});

export async function adminOrderRoutes(app: FastifyInstance) {
  const guard = (permission: Parameters<typeof app.requirePermission>[0]) => ({
    preHandler: [app.authenticate, app.requirePermission(permission)],
  });

  const respond = async (number: string, req: Parameters<typeof actorFrom>[0]) => {
    const { order, bins } = await fulfilmentService.detail(number);
    return { data: toStaffOrder(order, bins, can(actorFrom(req), 'pricing:view_cost')) };
  };

  app.get('/admin/orders', guard('orders:read_all'), async (req) => {
    const { items, page } = await fulfilmentService.list(ListQuery.parse(req.query));
    return { data: items.map(toStaffOrderRow), page };
  });

  app.get('/admin/orders/:number', guard('orders:read_all'), async (req) => {
    const { number } = OrderNumberParams.parse(req.params);
    return respond(number, req);
  });

  app.get('/admin/fulfilment/queue', guard('orders:read_all'), async () => ({ data: await fulfilmentService.pickingQueue() }));

  app.post('/admin/orders/:number/pack', guard('orders:update_status'), async (req) => {
    const { number } = OrderNumberParams.parse(req.params);
    PackBody.parse(req.body);
    await fulfilmentService.pack(number, actorFrom(req));
    return respond(number, req);
  });

  app.post('/admin/orders/:number/ready-for-collection', guard('orders:update_status'), async (req) => {
    const { number } = OrderNumberParams.parse(req.params);
    await fulfilmentService.readyForCollection(number, actorFrom(req));
    return respond(number, req);
  });

  app.post('/admin/orders/:number/handover', guard('orders:update_status'), async (req) => {
    const { number } = OrderNumberParams.parse(req.params);
    await fulfilmentService.handover(number, actorFrom(req));
    return respond(number, req);
  });

  app.post('/admin/orders/:number/cancel', guard('orders:cancel'), async (req) => {
    const { number } = OrderNumberParams.parse(req.params);
    const { reason } = ReasonBody.parse(req.body);
    await fulfilmentService.cancel(number, reason, actorFrom(req));
    return respond(number, req);
  });

  app.post('/admin/orders/:number/notes', guard('orders:read_all'), async (req) => {
    const { number } = OrderNumberParams.parse(req.params);
    const { body } = NoteBody.parse(req.body);
    await fulfilmentService.addNote(number, body, actorFrom(req));
    return respond(number, req);
  });

  app.post('/admin/orders/:number/payments', guard('orders:record_payment'), async (req, reply) => {
    const { number } = OrderNumberParams.parse(req.params);
    await paymentsService.recordManual(number, ManualPaymentBody.parse(req.body), actorFrom(req));
    return reply.status(201).send(await respond(number, req));
  });

  // ── Paperwork ──
  app.get('/admin/orders/:number/label.pdf', guard('orders:read_all'), async (req, reply) => {
    const { number } = OrderNumberParams.parse(req.params);
    const { order } = await fulfilmentService.detail(number);
    return reply.type('application/pdf').header('content-disposition', `inline; filename="${number}-label.pdf"`).send(await renderLabel(order));
  });

  app.get('/admin/orders/:number/packing-slip.pdf', guard('orders:read_all'), async (req, reply) => {
    const { number } = OrderNumberParams.parse(req.params);
    const { order } = await fulfilmentService.detail(number);
    return reply.type('application/pdf').header('content-disposition', `inline; filename="${number}-packing-slip.pdf"`).send(await renderPackingSlip(order));
  });
}
