import type { Prisma, PrismaClient, PurchaseOrderStatus } from '@prisma/client';
import type { z } from 'zod';
import { AppError } from '../../shared/errors/app-error';
import { emitEvent } from '../../shared/events/outbox';
import { encrypt } from '../../shared/crypto/encryption';
import { generateNumericCode, hmacCode, verifyHmacCode } from '../../shared/crypto/tokens';
import { nextJobNumber, nextRiderCode } from '../../shared/ids/numbers';
import { toPage } from '../../shared/pagination';
import type { Actor } from '../../shared/auth/actor';
import { recordAudit } from '../audit/audit.service';
import type { InventoryService } from '../inventory/inventory.service';
import type { OrdersService } from '../orders/orders.service';
import type { PaymentsService } from '../payments/payments.service';
import type { PurchaseOrdersService } from '../procurement/purchase-orders.service';
import { assertJobType, BUSY_STATUSES, codOutcome, last4, riderFeeFor } from './logistics.domain';
import { LOGISTICS_SETTINGS as S } from './logistics.settings';
import { transitionJob } from './job.transition';
import type {
  AdjustmentBody, CodListQuery, CollectionJobBody, DeliverBody, DeliveryJobBody, JobListQuery,
  ReconcileBody, RiderBody, RiderListQuery, RiderStatusBody, RiderUpdateBody,
} from './logistics.schemas';

type Tx = Prisma.TransactionClient;

export const jobInclude = {
  rider: true,
  order: { select: { number: true, status: true } },
  purchaseOrder: { select: { number: true, status: true } },
  events: { orderBy: { createdAt: 'asc' } },
  codCollection: true,
} satisfies Prisma.LogisticsJobInclude;
export type JobWithDetails = Prisma.LogisticsJobGetPayload<{ include: typeof jobInclude }>;

export class LogisticsService {
  constructor(
    private readonly db: PrismaClient,
    private readonly orders: OrdersService,
    private readonly pos: PurchaseOrdersService,
    private readonly inventory: InventoryService,
    private readonly payments: PaymentsService,
  ) {}

  // ═════════════ Riders ═════════════

  async createRider(input: z.infer<typeof RiderBody>, actor: Actor) {
    const { nationalId, ...rest } = input;
    const rider = await this.db.$transaction(async (tx) =>
      tx.rider.create({
        data: { ...rest, code: await nextRiderCode(tx), nationalIdEnc: encrypt(nationalId), nationalIdLast4: last4(nationalId) },
      }),
    );
    await recordAudit(this.db, { actorId: actor.userId, action: 'rider.created', entityType: 'rider', entityId: rider.id, after: { code: rider.code }, ip: actor.ip, requestId: actor.requestId });
    return rider;
  }

  async updateRider(id: string, input: z.infer<typeof RiderUpdateBody>) {
    const { nationalId, ...rest } = input;
    return this.db.rider.update({
      where: { id },
      data: { ...rest, ...(nationalId ? { nationalIdEnc: encrypt(nationalId), nationalIdLast4: last4(nationalId) } : {}) },
    });
  }

  async setRiderStatus(id: string, input: z.infer<typeof RiderStatusBody>, actor: Actor) {
    const before = await this.getRider(id);
    if (input.status !== 'ACTIVE') {
      const busy = await this.db.logisticsJob.count({ where: { riderId: id, status: { in: BUSY_STATUSES } } });
      if (busy) throw new AppError('CONFLICT', `${before.name} still has ${busy} active job(s). Reassign them first.`);
    }
    const rider = await this.db.rider.update({
      where: { id },
      data: { status: input.status, statusReason: input.reason, ...(input.status !== 'ACTIVE' ? { isOnDuty: false } : {}) },
    });
    await recordAudit(this.db, {
      actorId: actor.userId, action: 'rider.status_changed', entityType: 'rider', entityId: id,
      before: { status: before.status }, after: { status: input.status }, reason: input.reason, ip: actor.ip, requestId: actor.requestId,
    });
    return rider;
  }

  async setDuty(id: string, isOnDuty: boolean) {
    const rider = await this.getRider(id);
    if (isOnDuty && rider.status !== 'ACTIVE') throw new AppError('CONFLICT', `${rider.name} is ${rider.status.toLowerCase()}`);
    return this.db.rider.update({ where: { id }, data: { isOnDuty } });
  }

  async getRider(id: string) {
    const rider = await this.db.rider.findUnique({ where: { id } });
    if (!rider) throw new AppError('NOT_FOUND', 'Rider not found');
    return rider;
  }

  async listRiders(q: z.infer<typeof RiderListQuery>) {
    const riders = await this.db.rider.findMany({
      where: { ...(q.status ? { status: q.status } : {}), ...(q.onDuty ? { isOnDuty: q.onDuty === 'true' } : {}) },
      orderBy: { name: 'asc' },
      take: 500,
    });
    const busy = await this.busyCounts(riders.map((r) => r.id));
    return riders.map((r) => ({ ...r, activeJobs: busy.get(r.id) ?? 0 }));
  }

  /** Who can take a job right now: active, on duty, not full. Preferred riders first, then the least busy. */
  async availableRiders() {
    const riders = await this.listRiders({ status: 'ACTIVE', onDuty: 'true' });
    return riders
      .filter((r) => r.activeJobs < S.maxActiveJobsPerRider)
      .sort((a, b) => Number(b.isPreferred) - Number(a.isPreferred) || a.activeJobs - b.activeJobs || a.name.localeCompare(b.name));
  }

  // ═════════════ Create jobs (BR-005: the job exists before the rider leaves) ═════════════

  /** Boda boda trip to fetch a confirmed PO from the supplier. */
  async createCollectionJob(input: z.infer<typeof CollectionJobBody>, actor: Actor) {
    const po = await this.db.purchaseOrder.findUnique({ where: { number: input.purchaseOrderNumber }, include: { supplier: true } });
    if (!po) throw new AppError('NOT_FOUND', 'Purchase order not found');
    if (!['CONFIRMED_BY_SUPPLIER', 'PARTIALLY_CONFIRMED'].includes(po.status)) {
      throw new AppError('INVALID_STATE_TRANSITION', `Only supplier-confirmed POs can be collected (this one is ${po.status})`);
    }
    const zones = await this.db.deliveryZone.findMany({ select: { name: true, riderFeeCents: true } });
    const hub = await this.hub();

    const job = await this.db.$transaction(async (tx) =>
      tx.logisticsJob.create({
        data: {
          number: await nextJobNumber(tx), type: 'COLLECTION', urgency: input.urgency, purchaseOrderId: po.id, createdById: actor.userId,
          origin: { name: po.supplier.name, phone: po.supplier.phone, address: `${po.supplier.addressLine}, ${po.supplier.area}` },
          destination: hub,
          instructions: input.instructions ?? `Collect ${po.number}. Quote the collection code to the supplier.`,
          riderFeeCents: riderFeeFor(po.supplier.area, zones, S.defaultRiderFeeCents),
          events: { create: { toStatus: 'CREATED', actorId: actor.userId } },
        },
      }),
    );
    if (input.riderId) return this.assign(job.number, input.riderId, actor);
    return { job: await this.detail(job.number), collectionCode: null };
  }

  /** Boda boda trip to take a packed order to the customer. */
  async createDeliveryJob(input: z.infer<typeof DeliveryJobBody>, actor: Actor) {
    const order = await this.db.order.findUnique({ where: { number: input.orderNumber } });
    if (!order) throw new AppError('NOT_FOUND', 'Order not found');
    if (!['STANDARD', 'EXPRESS'].includes(order.deliveryMethod)) {
      throw new AppError('VALIDATION_FAILED', 'This order is not for delivery (click & collect / counter)');
    }
    if (order.status !== 'PACKED') throw new AppError('INVALID_STATE_TRANSITION', `Only packed orders can be dispatched (this one is ${order.status})`);
    const address = order.deliveryAddress as { line1: string; line2?: string; area: string; landmark?: string; notes?: string } | null;
    if (!address) throw new AppError('VALIDATION_FAILED', 'The order has no delivery address');

    const zone = order.deliveryZoneId ? await this.db.deliveryZone.findUnique({ where: { id: order.deliveryZoneId } }) : null;
    const hub = await this.hub();

    const job = await this.db.$transaction(async (tx) =>
      tx.logisticsJob.create({
        data: {
          number: await nextJobNumber(tx), type: 'DELIVERY', urgency: order.deliveryMethod === 'EXPRESS' ? 'URGENT' : input.urgency,
          orderId: order.id, createdById: actor.userId, origin: hub,
          destination: {
            name: order.contactName, phone: order.contactPhone,
            address: [address.line1, address.line2, address.area].filter(Boolean).join(', '),
            landmark: address.landmark ?? null, notes: address.notes ?? null,
          },
          instructions: input.instructions ?? null,
          // Balance due (COD orders, or the rest after a deposit) is collected in cash at the door.
          codAmountCents: Math.max(order.totalCents - order.amountPaidCents, 0),
          riderFeeCents: zone?.riderFeeCents ?? S.defaultRiderFeeCents,
          events: { create: { toStatus: 'CREATED', actorId: actor.userId } },
        },
      }),
    );
    if (input.riderId) return this.assign(job.number, input.riderId, actor);
    return { job: await this.detail(job.number), collectionCode: null };
  }

  // ═════════════ Assign / reassign ═════════════

  /**
   * Gives a job to a rider (or moves it to another rider before they leave).
   * Collection jobs get a FRESH collection code bound to this rider — returned once, for the rider only.
   */
  async assign(number: string, riderId: string, actor: Actor) {
    const job = await this.mustFind(number);
    if (!['CREATED', 'ASSIGNED'].includes(job.status)) throw new AppError('INVALID_STATE_TRANSITION', `A job that is ${job.status} cannot be (re)assigned`);
    if (job.riderId === riderId) throw new AppError('CONFLICT', 'The job is already assigned to this rider');
    let collectionCode: string | null = null;

    await this.db.$transaction(async (tx) => {
      // Lock the rider row: two dispatchers assigning at the same moment can't push a rider past the limit.
      await tx.$queryRaw`SELECT id FROM riders WHERE id = ${riderId}::uuid FOR UPDATE`;
      const rider = await tx.rider.findUnique({ where: { id: riderId } });
      if (!rider) throw new AppError('NOT_FOUND', 'Rider not found');
      if (rider.status !== 'ACTIVE') throw new AppError('CONFLICT', `${rider.name} is ${rider.status.toLowerCase()}`);
      const busy = await tx.logisticsJob.count({ where: { riderId, status: { in: BUSY_STATUSES } } });
      if (busy >= S.maxActiveJobsPerRider) throw new AppError('CONFLICT', `${rider.name} already has ${busy} active jobs`);

      if (job.status === 'CREATED') {
        await transitionJob(tx, job, 'ASSIGNED', { actorId: actor.userId, note: `Assigned to ${rider.code}`, data: { riderId, assignedAt: new Date() } });
      } else {
        const res = await tx.logisticsJob.updateMany({
          where: { id: job.id, status: 'ASSIGNED', version: job.version },
          data: { riderId, assignedAt: new Date(), version: { increment: 1 } },
        });
        if (res.count === 0) throw new AppError('CONFLICT', 'The job was changed by someone else. Reload and try again.');
        await tx.logisticsJobEvent.create({ data: { jobId: job.id, fromStatus: 'ASSIGNED', toStatus: 'ASSIGNED', actorId: actor.userId, note: `Reassigned to ${rider.code}` } });
      }

      if (job.type === 'COLLECTION') {
        collectionCode = await this.prepareCollection(tx, job.purchaseOrderId!, job.status === 'CREATED');
        await emitEvent(tx, {
          type: 'logistics.collection_assigned', aggregateType: 'logistics_job', aggregateId: job.id,
          // The notifications step decrypts this and SMSes the code to the rider only.
          payload: { jobId: job.id, riderId, purchaseOrderId: job.purchaseOrderId, codeEnc: encrypt(collectionCode) },
        });
      } else {
        await emitEvent(tx, { type: 'logistics.delivery_assigned', aggregateType: 'logistics_job', aggregateId: job.id, payload: { jobId: job.id, riderId, orderId: job.orderId } });
      }
    });

    return { job: await this.detail(number), collectionCode };
  }

  // ═════════════ Rider leaves the hub ═════════════

  async start(number: string, actor: Actor) {
    const job = await this.mustFind(number);
    if (job.status !== 'ASSIGNED' || !job.rider) throw new AppError('INVALID_STATE_TRANSITION', 'Assign a rider before the trip starts');
    const rider = job.rider;

    await this.db.$transaction(async (tx) => {
      if (job.type === 'COLLECTION') {
        await transitionJob(tx, job, 'EN_ROUTE', { actorId: actor.userId, data: { startedAt: new Date() } });
        return;
      }
      // Delivery: the parcel leaves the building → order DISPATCHED, held stock becomes SOLD.
      const otp = generateNumericCode(6);
      await transitionJob(tx, job, 'EN_ROUTE', {
        actorId: actor.userId,
        data: { startedAt: new Date(), deliveryOtpHash: hmacCode(`${job.id}:${otp}`), otpAttempts: 0 },
      });
      const order = await tx.order.findUniqueOrThrow({ where: { id: job.orderId! } });
      await this.orders.transition(tx, order, 'DISPATCHED', { actorId: actor.userId, note: `${job.number} with ${rider.code}` });
      await this.orders.commitOrderStock(tx, order, actor.userId);
      await this.orders.addTimelineEvent(tx, order.id, `Your rider is ${rider.name} (${rider.phone})`);
      await emitEvent(tx, {
        type: 'logistics.out_for_delivery', aggregateType: 'logistics_job', aggregateId: job.id,
        // The notifications step SMSes the OTP to the CUSTOMER; they read it to the rider at the door.
        payload: { jobId: job.id, orderId: order.id, riderName: rider.name, riderPhone: rider.phone, otpEnc: encrypt(otp), codAmountCents: job.codAmountCents },
      });
    });
    return this.detail(number);
  }

  // ═════════════ Collection: at the supplier, then back at the hub ═════════════

  /** The supplier hands over ONLY when the rider quotes the right code. Staff (or the supplier) enters it here. */
  async confirmCollected(number: string, code: string, actor: Actor) {
    const job = await this.mustFind(number);
    assertJobType(job, 'COLLECTION');
    if (job.status !== 'EN_ROUTE') throw new AppError('INVALID_STATE_TRANSITION', 'The rider has not started this trip');
    const po = await this.db.purchaseOrder.findUniqueOrThrow({ where: { id: job.purchaseOrderId! }, include: { items: true } });
    await this.checkCode({
      locked: po.collectionCodeAttempts >= S.maxCodeAttempts,
      valid: verifyHmacCode(po.collectionCodeHash, `${po.id}:${code}`),
      // Count the wrong guess OUTSIDE the main transaction, so it isn't rolled back with the error.
      recordFailure: async () => {
        const updated = await this.db.purchaseOrder.update({ where: { id: po.id }, data: { collectionCodeAttempts: { increment: 1 } } });
        if (updated.collectionCodeAttempts >= S.maxCodeAttempts) {
          await emitEvent(this.db, { type: 'alert.collection_code_locked', aggregateType: 'purchase_order', aggregateId: po.id, payload: { poNumber: po.number, jobNumber: job.number } });
        }
      },
      what: 'collection code',
    });

    await this.db.$transaction(async (tx) => {
      await transitionJob(tx, job, 'COLLECTED', { actorId: actor.userId });
      const fresh = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
      await this.pos.transition(tx, fresh, 'COLLECTED', { collectionCodeHash: null }); // single use
      const orderItemIds = po.items.filter((i) => i.orderItemId && (i.confirmedQty ?? i.quantity) > 0).map((i) => i.orderItemId!);
      await tx.orderItem.updateMany({ where: { id: { in: orderItemIds } }, data: { sourcingStatus: 'COLLECTED' } });
      for (const orderId of await this.orderIdsOf(tx, orderItemIds)) {
        await this.orders.addTimelineEvent(tx, orderId, 'Your part has been collected and is on its way to our hub');
      }
    });
    return this.detail(number);
  }

  /** Rider dropped the parts at the hub. Trip done → rider earns. Goods are then checked in with a GRN. */
  async arrivedAtHub(number: string, actor: Actor) {
    const job = await this.mustFind(number);
    assertJobType(job, 'COLLECTION');
    await this.db.$transaction(async (tx) => {
      await transitionJob(tx, job, 'AT_HUB', { actorId: actor.userId, data: { completedAt: new Date() } });
      await this.earnTrip(tx, job);
    });
    return this.detail(number);
  }

  // ═════════════ Delivery: proof at the door ═════════════

  async deliver(number: string, proof: z.infer<typeof DeliverBody>, actor: Actor) {
    const job = await this.mustFind(number);
    assertJobType(job, 'DELIVERY');
    if (job.status !== 'EN_ROUTE') throw new AppError('INVALID_STATE_TRANSITION', `This job is ${job.status}, not out for delivery`);
    if (proof.type === 'OTP') {
      await this.checkCode({
        locked: job.otpAttempts >= S.maxCodeAttempts,
        valid: verifyHmacCode(job.deliveryOtpHash, `${job.id}:${proof.code}`),
        recordFailure: async () => {
          await this.db.logisticsJob.update({ where: { id: job.id }, data: { otpAttempts: { increment: 1 } } });
        },
        what: 'delivery code',
      });
    }
    const now = new Date();

    await this.db.$transaction(async (tx) => {
      await transitionJob(tx, job, 'DELIVERED', {
        actorId: actor.userId,
        data: { completedAt: now, deliveryOtpHash: null, proof: proof.type === 'OTP' ? { type: 'OTP' } : proof },
      });
      const order = await tx.order.findUniqueOrThrow({ where: { id: job.orderId! } });
      await this.orders.transition(tx, order, 'DELIVERED', { actorId: actor.userId, data: { deliveredAt: now } });
      await this.earnTrip(tx, job);

      if (job.codAmountCents > 0) {
        // The rider now holds the customer's cash — tracked until it's counted at the shop (BR-006).
        await tx.codCollection.create({
          data: { jobId: job.id, orderId: order.id, riderId: job.riderId!, expectedCents: job.codAmountCents, collectedAt: now },
        });
      } else {
        await this.completeIfSettled(tx, order.id, actor.userId);
      }
    });
    return this.detail(number);
  }

  // ═════════════ When things go wrong ═════════════

  /** The trip didn't work (customer unreachable, supplier didn't hand over…). */
  async fail(number: string, reason: string, actor: Actor) {
    const job = await this.mustFind(number);
    if (job.status !== 'EN_ROUTE') throw new AppError('INVALID_STATE_TRANSITION', 'Only a trip in progress can fail. Cancel it instead.');

    await this.db.$transaction(async (tx) => {
      await transitionJob(tx, job, 'FAILED', { actorId: actor.userId, note: reason, data: { failReason: reason, deliveryOtpHash: null } });
      if (job.type === 'COLLECTION') {
        await this.releaseCollection(tx, job.purchaseOrderId!);
        await this.earnTrip(tx, job); // the rider still made the trip
      }
      // Delivery: the order stays DISPATCHED until the parcel is back (see returnToHub).
      await emitEvent(tx, { type: 'alert.logistics_job_failed', aggregateType: 'logistics_job', aggregateId: job.id, payload: { jobNumber: job.number, type: job.type, reason } });
    });
    return this.detail(number);
  }

  /** A failed delivery's parcel is back at the hub: stock goes back on hold for the order, order → PACKED. */
  async returnToHub(number: string, actor: Actor) {
    const job = await this.mustFind(number);
    assertJobType(job, 'DELIVERY');

    await this.db.$transaction(async (tx) => {
      await transitionJob(tx, job, 'RETURNED', { actorId: actor.userId, data: { completedAt: new Date() } });
      const order = await tx.order.findUniqueOrThrow({ where: { id: job.orderId! }, include: { items: true } });
      for (const item of order.items) {
        await this.inventory.receive(tx, {
          productId: item.productId, quantity: item.quantity, reason: 'DELIVERY_RETURNED', unitCostCents: item.unitCostCents,
          referenceType: 'ORDER', referenceId: order.number, actorId: actor.userId,
        });
        await this.inventory.reserve(tx, { productId: item.productId, quantity: item.quantity, orderItemId: item.id });
      }
      await this.orders.transition(tx, order, 'PACKED', { actorId: actor.userId, note: `Returned to hub: ${job.failReason ?? 'delivery failed'}` });
      await this.orders.addTimelineEvent(tx, order.id, "We couldn't complete your delivery — we'll call you to arrange a new time");
      await this.earnTrip(tx, job);
    });
    return this.detail(number);
  }

  /** Before the rider leaves. Collections: the PO goes back to "confirmed, awaiting collection". */
  async cancel(number: string, reason: string, actor: Actor) {
    const job = await this.mustFind(number);
    await this.db.$transaction(async (tx) => {
      await transitionJob(tx, job, 'CANCELLED', { actorId: actor.userId, note: reason, data: { cancelReason: reason } });
      if (job.type === 'COLLECTION') await this.releaseCollection(tx, job.purchaseOrderId!);
    });
    return this.detail(number);
  }

  // ═════════════ Read ═════════════

  async list(q: z.infer<typeof JobListQuery>) {
    const rows = await this.db.logisticsJob.findMany({
      where: { ...(q.type ? { type: q.type } : {}), ...(q.status ? { status: q.status } : {}), ...(q.riderId ? { riderId: q.riderId } : {}) },
      include: { rider: { select: { code: true, name: true, phone: true } }, order: { select: { number: true } }, purchaseOrder: { select: { number: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    return toPage(rows, q.limit);
  }

  async detail(number: string) {
    const job = await this.db.logisticsJob.findUnique({ where: { number }, include: jobInclude });
    if (!job) throw new AppError('NOT_FOUND', 'Job not found');
    return job;
  }

  // ═════════════ Cash on delivery (BR-006) ═════════════

  listCod(q: z.infer<typeof CodListQuery>) {
    return this.db.codCollection.findMany({
      where: { ...(q.status ? { status: q.status } : {}), ...(q.riderId ? { riderId: q.riderId } : {}) },
      include: { rider: { select: { code: true, name: true, phone: true } }, job: { select: { number: true } } },
      orderBy: { collectedAt: 'asc' },
      take: 500,
    });
  }

  /** Staff count the rider's cash at the shop. A matching count settles the order; a short count raises an alert. */
  async reconcileCod(id: string, input: z.infer<typeof ReconcileBody>, actor: Actor) {
    const cod = await this.db.codCollection.findUnique({ where: { id } });
    if (!cod) throw new AppError('NOT_FOUND', 'COD record not found');
    if (input.handedOverCents > cod.expectedCents) {
      throw new AppError('VALIDATION_FAILED', `Only ${cod.expectedCents / 100} KES was due. Give the extra back to the rider.`);
    }
    const { status, shortCents } = codOutcome(cod.expectedCents, input.handedOverCents);

    await this.db.$transaction(async (tx) => {
      // Compare-and-set: two people can't count the same cash twice.
      const res = await tx.codCollection.updateMany({
        where: { id, status: 'OUTSTANDING' },
        data: { status, handedOverCents: input.handedOverCents, reconciledAt: new Date(), reconciledById: actor.userId, note: input.note ?? null },
      });
      if (res.count === 0) throw new AppError('CONFLICT', 'This cash was already counted');

      if (input.handedOverCents > 0) await this.payments.recordCodPayment(tx, cod.orderId, input.handedOverCents, cod.id);
      await this.completeIfSettled(tx, cod.orderId, actor.userId);

      if (status === 'DISCREPANCY') {
        await emitEvent(tx, { type: 'alert.cod_discrepancy', aggregateType: 'cod_collection', aggregateId: cod.id, payload: { codId: cod.id, riderId: cod.riderId, shortCents } });
      }
      await recordAudit(tx, {
        actorId: actor.userId, action: 'cod.reconciled', entityType: 'cod_collection', entityId: cod.id,
        after: { status, expectedCents: cod.expectedCents, handedOverCents: input.handedOverCents }, reason: input.note ?? null, ip: actor.ip, requestId: actor.requestId,
      });
    });
    return this.db.codCollection.findUniqueOrThrow({ where: { id } });
  }

  /** Worker job (hourly): alert once for COD cash not handed in within 24 hours. */
  async alertOverdueCod(now = new Date()) {
    const cutoff = new Date(now.getTime() - S.codHandoverHours * 60 * 60 * 1000);
    const overdue = await this.db.codCollection.findMany({ where: { status: 'OUTSTANDING', alertedAt: null, collectedAt: { lt: cutoff } }, take: 200 });
    for (const cod of overdue) {
      await this.db.$transaction(async (tx) => {
        const res = await tx.codCollection.updateMany({ where: { id: cod.id, alertedAt: null }, data: { alertedAt: now } });
        if (res.count === 0) return; // another worker got it
        await emitEvent(tx, {
          type: 'alert.cod_overdue', aggregateType: 'cod_collection', aggregateId: cod.id,
          payload: { codId: cod.id, riderId: cod.riderId, expectedCents: cod.expectedCents, collectedAt: cod.collectedAt.toISOString() },
        });
      });
    }
    return overdue.length;
  }

  // ═════════════ Rider earnings ═════════════

  async earnings(riderId: string, q: { from?: Date | undefined; to?: Date | undefined }) {
    await this.getRider(riderId);
    const where: Prisma.RiderEarningWhereInput = {
      riderId,
      ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
    };
    const [rows, sum] = await Promise.all([
      this.db.riderEarning.findMany({ where, include: { job: { select: { number: true, type: true } } }, orderBy: { createdAt: 'desc' }, take: 500 }),
      this.db.riderEarning.aggregate({ where, _sum: { amountCents: true } }),
    ]);
    return { totalCents: sum._sum.amountCents ?? 0, items: rows };
  }

  /** Bonus or deduction (e.g. COD shortfall, damaged parcel). Always audited with a reason. */
  async addAdjustment(riderId: string, input: z.infer<typeof AdjustmentBody>, actor: Actor) {
    await this.getRider(riderId);
    const amountCents = input.type === 'DEDUCTION' ? -input.amountCents : input.amountCents;
    return this.db.$transaction(async (tx) => {
      const row = await tx.riderEarning.create({ data: { riderId, type: input.type, amountCents, reason: input.reason, createdById: actor.userId } });
      await recordAudit(tx, { actorId: actor.userId, action: 'rider.earning_adjusted', entityType: 'rider', entityId: riderId, after: { type: input.type, amountCents }, reason: input.reason, ip: actor.ip, requestId: actor.requestId });
      return row;
    });
  }

  // ── helpers ──

  private async mustFind(number: string) {
    const job = await this.db.logisticsJob.findUnique({ where: { number }, include: { rider: true } });
    if (!job) throw new AppError('NOT_FOUND', 'Job not found');
    return job;
  }

  /** The hub's address (origin of deliveries, destination of collections). */
  private async hub() {
    const loc = await this.db.location.findFirst({ where: { isDefault: true } });
    return { name: loc?.name ?? 'MySpares Hub', phone: null, address: loc?.address ?? 'MySpares Hub, Nairobi' };
  }

  private async busyCounts(riderIds: string[]) {
    const rows = await this.db.logisticsJob.groupBy({ by: ['riderId'], where: { riderId: { in: riderIds }, status: { in: BUSY_STATUSES } }, _count: true });
    return new Map(rows.map((r) => [r.riderId!, r._count]));
  }

  /** Shared check for collection codes and delivery OTPs: locked after too many wrong tries. */
  private async checkCode(c: { locked: boolean; valid: boolean; recordFailure: () => Promise<void>; what: string }) {
    if (c.locked) throw new AppError('FORBIDDEN', `Too many wrong attempts — the ${c.what} is locked. Contact a manager.`);
    if (!c.valid) {
      await c.recordFailure();
      throw new AppError('VALIDATION_FAILED', `Wrong ${c.what}`);
    }
  }

  /** New rider on a collection: rotate the code and mark the customer's parts "rider on the way". */
  private async prepareCollection(tx: Tx, poId: string, firstAssignment: boolean) {
    const code = generateNumericCode(6);
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: poId }, include: { items: true } });
    const codeData = { collectionCodeHash: hmacCode(`${po.id}:${code}`), collectionCodeAttempts: 0 };
    if (po.status === 'RIDER_ASSIGNED') {
      await tx.purchaseOrder.update({ where: { id: po.id }, data: codeData });
    } else {
      await this.pos.transition(tx, po, 'RIDER_ASSIGNED', codeData);
    }
    if (firstAssignment) {
      const orderItemIds = po.items.filter((i) => i.orderItemId && (i.confirmedQty ?? i.quantity) > 0).map((i) => i.orderItemId!);
      await tx.orderItem.updateMany({ where: { id: { in: orderItemIds } }, data: { sourcingStatus: 'RIDER_ASSIGNED' } });
      for (const orderId of await this.orderIdsOf(tx, orderItemIds)) {
        await this.orders.addTimelineEvent(tx, orderId, 'A MySpares rider is on the way to collect your part');
      }
    }
    return code;
  }

  /** Collection didn't happen: PO back to "confirmed, awaiting collection"; the old code stops working. */
  private async releaseCollection(tx: Tx, poId: string) {
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: poId }, include: { items: true } });
    if (po.status !== 'RIDER_ASSIGNED') return;
    const partial = po.items.some((i) => i.confirmedQty != null && i.confirmedQty < i.quantity);
    const back: PurchaseOrderStatus = partial ? 'PARTIALLY_CONFIRMED' : 'CONFIRMED_BY_SUPPLIER';
    await this.pos.transition(tx, po, back, { collectionCodeHash: null });
    const orderItemIds = po.items.filter((i) => i.orderItemId).map((i) => i.orderItemId!);
    await tx.orderItem.updateMany({ where: { id: { in: orderItemIds }, sourcingStatus: 'RIDER_ASSIGNED' }, data: { sourcingStatus: 'SUPPLIER_CONFIRMED' } });
  }

  /** One TRIP earning per job — the unique jobId makes paying twice impossible. */
  private async earnTrip(tx: Tx, job: { id: string; riderId: string | null; riderFeeCents: number }) {
    if (!job.riderId || job.riderFeeCents <= 0) return;
    await tx.riderEarning.create({ data: { riderId: job.riderId, jobId: job.id, type: 'TRIP', amountCents: job.riderFeeCents } });
  }

  /** A delivered order that is fully paid is complete. */
  private async completeIfSettled(tx: Tx, orderId: string, actorId: string) {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status === 'DELIVERED' && order.amountPaidCents >= order.totalCents) {
      await this.orders.transition(tx, order, 'COMPLETED', { actorId, data: { completedAt: new Date() } });
    }
  }

  private async orderIdsOf(tx: Tx, orderItemIds: string[]) {
    if (orderItemIds.length === 0) return [];
    const rows = await tx.orderItem.findMany({ where: { id: { in: orderItemIds } }, select: { orderId: true }, distinct: ['orderId'] });
    return rows.map((r) => r.orderId);
  }
}
