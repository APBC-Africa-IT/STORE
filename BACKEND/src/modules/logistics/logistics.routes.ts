import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Rider } from '@prisma/client';
import { prisma } from '../../shared/db/prisma';
import { actorFrom } from '../../shared/auth/actor';
import { inventoryService } from '../inventory/inventory.routes';
import { ordersService } from '../orders/orders.routes';
import { paymentsService } from '../payments/payments.routes';
import { purchaseOrdersService } from '../procurement/procurement.routes';
import { LogisticsService, type JobWithDetails } from './logistics.service';
import {
  AdjustmentBody, AssignBody, CodListQuery, CollectBody, CollectionJobBody, DeliverBody, DeliveryJobBody, DutyBody,
  EarningsQuery, JobListQuery, JobParams, ReasonBody, ReconcileBody, RiderBody, RiderListQuery, RiderStatusBody, RiderUpdateBody,
} from './logistics.schemas';

export const logisticsService = new LogisticsService(prisma, ordersService, purchaseOrdersService, inventoryService, paymentsService);

const IdParams = z.object({ id: z.uuid() });

/** Riders as staff see them: the national ID never leaves the database (only the last 4 digits). */
function toRiderDto<T extends Rider>(r: T) {
  const { nationalIdEnc: _secret, ...rest } = r;
  return rest;
}

/** Jobs: hide the OTP hash and the rider's national ID. */
function toJobDto(job: JobWithDetails) {
  const { deliveryOtpHash: _otp, rider, ...rest } = job;
  return { ...rest, rider: rider ? toRiderDto(rider) : null };
}

export async function logisticsRoutes(app: FastifyInstance) {
  const guard = (permission: Parameters<typeof app.requirePermission>[0]) => ({
    preHandler: [app.authenticate, app.requirePermission(permission)],
  });

  // ═════ Riders ═════
  app.get('/admin/riders', guard('logistics:assign'), async (req) => {
    return { data: (await logisticsService.listRiders(RiderListQuery.parse(req.query))).map(toRiderDto) };
  });
  app.get('/admin/riders/available', guard('logistics:assign'), async () => {
    return { data: (await logisticsService.availableRiders()).map(toRiderDto) };
  });
  app.post('/admin/riders', guard('logistics:manage_riders'), async (req, reply) => {
    return reply.status(201).send({ data: toRiderDto(await logisticsService.createRider(RiderBody.parse(req.body), actorFrom(req))) });
  });
  app.patch('/admin/riders/:id', guard('logistics:manage_riders'), async (req) => {
    return { data: toRiderDto(await logisticsService.updateRider(IdParams.parse(req.params).id, RiderUpdateBody.parse(req.body))) };
  });
  app.post('/admin/riders/:id/status', guard('logistics:manage_riders'), async (req) => {
    return { data: toRiderDto(await logisticsService.setRiderStatus(IdParams.parse(req.params).id, RiderStatusBody.parse(req.body), actorFrom(req))) };
  });
  app.post('/admin/riders/:id/duty', guard('logistics:assign'), async (req) => {
    return { data: toRiderDto(await logisticsService.setDuty(IdParams.parse(req.params).id, DutyBody.parse(req.body).isOnDuty)) };
  });
  app.get('/admin/riders/:id/earnings', guard('logistics:manage_riders'), async (req) => {
    return { data: await logisticsService.earnings(IdParams.parse(req.params).id, EarningsQuery.parse(req.query)) };
  });
  app.post('/admin/riders/:id/earnings', guard('logistics:manage_riders'), async (req, reply) => {
    return reply.status(201).send({ data: await logisticsService.addAdjustment(IdParams.parse(req.params).id, AdjustmentBody.parse(req.body), actorFrom(req)) });
  });

  // ═════ Jobs ═════
  app.get('/admin/logistics/jobs', guard('logistics:assign'), async (req) => {
    const { items, page } = await logisticsService.list(JobListQuery.parse(req.query));
    return { data: items, page };
  });
  app.get('/admin/logistics/jobs/:number', guard('logistics:assign'), async (req) => {
    return { data: toJobDto(await logisticsService.detail(JobParams.parse(req.params).number)) };
  });
  app.post('/admin/logistics/jobs/collection', guard('logistics:assign'), async (req, reply) => {
    const { job, collectionCode } = await logisticsService.createCollectionJob(CollectionJobBody.parse(req.body), actorFrom(req));
    return reply.status(201).send({ data: { ...toJobDto(job), collectionCode } });
  });
  app.post('/admin/logistics/jobs/delivery', guard('logistics:assign'), async (req, reply) => {
    const { job } = await logisticsService.createDeliveryJob(DeliveryJobBody.parse(req.body), actorFrom(req));
    return reply.status(201).send({ data: toJobDto(job) });
  });
  app.post('/admin/logistics/jobs/:number/assign', guard('logistics:assign'), async (req) => {
    const { job, collectionCode } = await logisticsService.assign(JobParams.parse(req.params).number, AssignBody.parse(req.body).riderId, actorFrom(req));
    // collectionCode is shown ONCE — read it to the rider (Step 13 also SMSes it to them).
    return { data: { ...toJobDto(job), collectionCode } };
  });
  app.post('/admin/logistics/jobs/:number/start', guard('logistics:assign'), async (req) => {
    return { data: toJobDto(await logisticsService.start(JobParams.parse(req.params).number, actorFrom(req))) };
  });
  app.post('/admin/logistics/jobs/:number/collected', guard('logistics:assign'), async (req) => {
    const { code } = CollectBody.parse(req.body);
    return { data: toJobDto(await logisticsService.confirmCollected(JobParams.parse(req.params).number, code, actorFrom(req))) };
  });
  app.post('/admin/logistics/jobs/:number/arrived', guard('logistics:assign'), async (req) => {
    return { data: toJobDto(await logisticsService.arrivedAtHub(JobParams.parse(req.params).number, actorFrom(req))) };
  });
  app.post('/admin/logistics/jobs/:number/delivered', guard('logistics:assign'), async (req) => {
    return { data: toJobDto(await logisticsService.deliver(JobParams.parse(req.params).number, DeliverBody.parse(req.body), actorFrom(req))) };
  });
  app.post('/admin/logistics/jobs/:number/fail', guard('logistics:assign'), async (req) => {
    const { reason } = ReasonBody.parse(req.body);
    return { data: toJobDto(await logisticsService.fail(JobParams.parse(req.params).number, reason, actorFrom(req))) };
  });
  app.post('/admin/logistics/jobs/:number/returned', guard('logistics:assign'), async (req) => {
    return { data: toJobDto(await logisticsService.returnToHub(JobParams.parse(req.params).number, actorFrom(req))) };
  });
  app.post('/admin/logistics/jobs/:number/cancel', guard('logistics:assign'), async (req) => {
    const { reason } = ReasonBody.parse(req.body);
    return { data: toJobDto(await logisticsService.cancel(JobParams.parse(req.params).number, reason, actorFrom(req))) };
  });

  // ═════ Cash on delivery ═════
  app.get('/admin/logistics/cod', guard('logistics:reconcile_cod'), async (req) => {
    return { data: await logisticsService.listCod(CodListQuery.parse(req.query)) };
  });
  app.post('/admin/logistics/cod/:id/reconcile', guard('logistics:reconcile_cod'), async (req) => {
    return { data: await logisticsService.reconcileCod(IdParams.parse(req.params).id, ReconcileBody.parse(req.body), actorFrom(req)) };
  });
}
