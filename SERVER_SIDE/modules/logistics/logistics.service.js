/**
 * Logistics service — riders, delivery zones, collection & delivery jobs, COD reconciliation.
 * §8.7 of the backend guide.
 */
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/codes.js';
import { recordAudit } from '../audit/audit.service.js';
import { emitOutboxEvent } from '../../shared/events/outbox.js';
import { EVENTS } from '../../shared/events/event-types.js';
import { generateJobNumber, generateRiderCode } from '../../shared/ids/index.js';
import { encryptField, decryptField, generateOtpCode, sha256 } from '../../shared/crypto/index.js';
import { getSetting } from '../settings/settings.service.js';

// ── Riders ────────────────────────────────────────────────────────────────

export async function listRiders({ status, page = 1, pageSize = 25 }) {
  const where = status ? { status } : {};
  const [riders, total] = await Promise.all([
    prisma.rider.findMany({
      where,
      select: { id: true, code: true, name: true, phone: true, bikePlate: true, mpesaNumber: true,
                status: true, isPreferred: true, isOnDuty: true, ratingAvgX100: true, createdAt: true },
      orderBy: [{ isPreferred: 'desc' }, { name: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.rider.count({ where }),
  ]);
  return { riders, total, page, pageSize };
}

export async function getRider(id) {
  const rider = await prisma.rider.findUnique({
    where: { id },
    select: { id: true, code: true, name: true, phone: true, bikePlate: true, mpesaNumber: true,
              status: true, isPreferred: true, isOnDuty: true, ratingAvgX100: true, createdAt: true },
  });
  if (!rider) throw new AppError('NOT_FOUND', 'Rider not found');
  return rider;
}

export async function createRider(data, actor) {
  const code = await generateRiderCode();
  // Encrypt PII fields
  const nationalIdEnc = encryptField(data.nationalId);

  const rider = await prisma.$transaction(async tx => {
    const r = await tx.rider.create({
      data: {
        code, name: data.name, phone: data.phone, nationalIdEnc,
        bikePlate: data.bikePlate, mpesaNumber: data.mpesaNumber,
        status: 'PENDING_APPROVAL',
      },
    });
    await recordAudit({ actor, action: 'rider.created', entityType: 'rider', entityId: r.id,
      after: { code: r.code, name: r.name } }, tx);
    return r;
  });

  const { nationalIdEnc: _enc, ...safe } = rider;
  return safe;
}

export async function approveRider(id, actor) {
  await prisma.$transaction(async tx => {
    await tx.rider.update({ where: { id }, data: { status: 'ACTIVE' } });
    await emitOutboxEvent(EVENTS.RIDER_APPROVED, 'rider', id, { riderId: id }, tx);
    await recordAudit({ actor, action: 'rider.approved', entityType: 'rider', entityId: id }, tx);
  });
}

export async function suspendRider(id, reason, actor) {
  await prisma.$transaction(async tx => {
    await tx.rider.update({ where: { id }, data: { status: 'SUSPENDED', statusReason: reason } });
    await recordAudit({ actor, action: 'rider.suspended', entityType: 'rider', entityId: id, after: { reason } }, tx);
  });
}

export async function reactivateRider(id, actor) {
  await prisma.$transaction(async tx => {
    await tx.rider.update({ where: { id }, data: { status: 'ACTIVE', statusReason: null } });
    await recordAudit({ actor, action: 'rider.reactivated', entityType: 'rider', entityId: id }, tx);
  });
}

export async function setRiderDuty(id, isOnDuty, actor) {
  await prisma.rider.update({ where: { id }, data: { isOnDuty } });
}

export async function getRiderEarnings(riderId, { unpaidOnly = false } = {}) {
  const where = { riderId };
  if (unpaidOnly) where.payoutId = null;
  return prisma.riderEarning.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
}

// ── Delivery Zones ─────────────────────────────────────────────────────────

export async function listZones() {
  return prisma.deliveryZone.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
}

export async function createZone(data, actor) {
  return prisma.deliveryZone.create({ data });
}

export async function updateZone(id, data, actor) {
  return prisma.deliveryZone.update({ where: { id }, data });
}

// ── Logistics Jobs ─────────────────────────────────────────────────────────

export async function listJobs({ status, type, riderId, page = 1, pageSize = 25 }) {
  const where = {};
  if (status)  where.status  = status;
  if (type)    where.type    = type;
  if (riderId) where.riderId = riderId;

  const [jobs, total] = await Promise.all([
    prisma.logisticsJob.findMany({
      where,
      include: { rider: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.logisticsJob.count({ where }),
  ]);
  return { jobs, total, page, pageSize };
}

export async function getJob(id) {
  const job = await prisma.logisticsJob.findUnique({
    where: { id },
    include: { rider: true, events: { orderBy: { createdAt: 'asc' } } },
  });
  if (!job) throw new AppError('NOT_FOUND', 'Job not found');
  return job;
}

export async function createJob({ type, purchaseOrderId, orderId, origin, destination, urgency = 'NORMAL', instructions, codAmountCents = 0, riderFeeCents }, actor) {
  const number = await generateJobNumber();
  const job = await prisma.$transaction(async tx => {
    const j = await tx.logisticsJob.create({
      data: {
        number, type, status: 'CREATED',
        purchaseOrderId: purchaseOrderId || null,
        orderId: orderId || null,
        origin, destination,
        urgency, instructions: instructions || null,
        codAmountCents, riderFeeCents: riderFeeCents || 0,
        createdById: actor.userId,
      },
    });
    await emitOutboxEvent(EVENTS.JOB_CREATED, 'logistics_job', j.id, { jobId: j.id, type }, tx);
    await recordAudit({ actor, action: 'job.created', entityType: 'logistics_job', entityId: j.id,
      after: { number, type } }, tx);
    return j;
  });
  return job;
}

export async function assignJob(jobId, riderId, actor) {
  const job = await getJob(jobId);
  if (!['CREATED', 'ASSIGNED'].includes(job.status)) {
    throw new AppError('INVALID_STATE_TRANSITION', `Job cannot be assigned from status ${job.status}`);
  }

  const rider = await prisma.rider.findUnique({ where: { id: riderId } });
  if (!rider || rider.status !== 'ACTIVE') throw new AppError('CONFLICT', 'Rider is not active');

  // Check max concurrent jobs
  const maxJobs = await getSetting('logistics.maxConcurrentJobs') || 3;
  const activeJobCount = await prisma.logisticsJob.count({
    where: { riderId, status: { in: ['ASSIGNED', 'EN_ROUTE', 'COLLECTED', 'DELIVERED_TO_HUB'] } },
  });
  if (activeJobCount >= maxJobs) {
    throw new AppError('CONFLICT', `Rider already has ${activeJobCount} active jobs (max ${maxJobs})`);
  }

  await prisma.$transaction(async tx => {
    await tx.logisticsJob.update({
      where: { id: jobId },
      data: { riderId, status: 'ASSIGNED', assignedAt: new Date(), version: { increment: 1 } },
    });
    await tx.logisticsJobEvent.create({
      data: { jobId, fromStatus: job.status, toStatus: 'ASSIGNED', actorId: actor.userId },
    });
    // Update PO if collection job
    if (job.type === 'COLLECTION' && job.purchaseOrderId) {
      await tx.purchaseOrder.update({ where: { id: job.purchaseOrderId }, data: { status: 'RIDER_ASSIGNED' } });
    }
    await emitOutboxEvent(EVENTS.JOB_ASSIGNED, 'logistics_job', jobId, { jobId, riderId }, tx);
    await recordAudit({ actor, action: 'job.assigned', entityType: 'logistics_job', entityId: jobId,
      after: { riderId } }, tx);
  });
}

export async function updateJobStatus(jobId, toStatus, { actorId, note, lat, lng, codAmountReported, otpCode, proofFileId } = {}) {
  const job = await getJob(jobId);
  const actor = { userId: actorId };

  // OTP verification for delivery confirmation
  if (toStatus === 'CUSTOMER_CONFIRMED' && job.deliveryOtpHash) {
    if (!otpCode) throw new AppError('VALIDATION_FAILED', 'OTP code required to confirm delivery');
    const hash = sha256(otpCode);
    if (hash !== job.deliveryOtpHash) {
      await prisma.logisticsJob.update({ where: { id: jobId }, data: { otpAttempts: { increment: 1 } } });
      if (job.otpAttempts >= 4) throw new AppError('RATE_LIMITED', 'Too many OTP attempts');
      throw new AppError('UNAUTHENTICATED', 'Invalid delivery OTP');
    }
  }

  const validTransitions = {
    CREATED:         ['ASSIGNED', 'CANCELLED'],
    ASSIGNED:        ['EN_ROUTE', 'CANCELLED', 'FAILED', 'CREATED'], // CREATED = unassign
    EN_ROUTE:        ['COLLECTED', 'DELIVERED', 'FAILED', 'CANCELLED'],
    COLLECTED:       ['DELIVERED_TO_HUB', 'FAILED', 'CANCELLED'],
    DELIVERED_TO_HUB:['CONFIRMED', 'FAILED'],
    DELIVERED:       ['CUSTOMER_CONFIRMED', 'FAILED'],
  };

  if (!validTransitions[job.status]?.includes(toStatus)) {
    throw new AppError('INVALID_STATE_TRANSITION', `Job ${job.status} → ${toStatus} not allowed`);
  }

  await prisma.$transaction(async tx => {
    const updates = {
      status: toStatus,
      version: { increment: 1 },
    };
    if (toStatus === 'EN_ROUTE')           updates.startedAt   = new Date();
    if (['DELIVERED', 'CONFIRMED', 'CUSTOMER_CONFIRMED'].includes(toStatus)) updates.completedAt = new Date();
    if (proofFileId) updates.proofFileId = proofFileId;

    await tx.logisticsJob.update({ where: { id: jobId }, data: updates });
    await tx.logisticsJobEvent.create({
      data: { jobId, fromStatus: job.status, toStatus, actorId: actorId || null, lat: lat || null, lng: lng || null, note: note || null },
    });

    // COD: create CodCollection on delivery
    if (toStatus === 'DELIVERED' && job.codAmountCents > 0 && job.orderId) {
      await tx.codCollection.create({
        data: {
          jobId,
          orderId: job.orderId,
          riderId: job.riderId,
          expectedCents: job.codAmountCents,
          reportedCents: codAmountReported || null,
          status: 'OUTSTANDING',
          collectedAt: new Date(),
        },
      });
    }

    // Rider earnings on completion
    if (['CONFIRMED', 'CUSTOMER_CONFIRMED'].includes(toStatus) && job.riderId && job.riderFeeCents > 0) {
      await tx.riderEarning.create({
        data: {
          riderId: job.riderId,
          jobId,
          amountCents: job.riderFeeCents,
          type: 'TRIP',
          reason: `Job ${job.number}`,
        },
      });
    }

    await emitOutboxEvent(EVENTS.JOB_STATUS_CHANGED, 'logistics_job', jobId,
      { jobId, fromStatus: job.status, toStatus }, tx);
  });
}

// ── COD reconciliation ─────────────────────────────────────────────────────

export async function getOutstandingCod({ riderId } = {}) {
  const where = { status: 'OUTSTANDING' };
  if (riderId) where.riderId = riderId;
  return prisma.codCollection.findMany({
    where,
    include: { rider: { select: { id: true, name: true, phone: true } } },
    orderBy: { collectedAt: 'asc' },
  });
}

export async function reconcileCod(codId, { handedOverCents, note }, actor) {
  const cod = await prisma.codCollection.findUnique({ where: { id: codId } });
  if (!cod) throw new AppError('NOT_FOUND', 'COD collection not found');
  if (cod.status !== 'OUTSTANDING') throw new AppError('CONFLICT', 'Already reconciled');

  const hasDiscrepancy = Math.abs(handedOverCents - cod.expectedCents) > 100; // > 1 KES difference

  await prisma.$transaction(async tx => {
    await tx.codCollection.update({
      where: { id: codId },
      data: {
        handedOverCents,
        status: hasDiscrepancy ? 'DISCREPANCY' : 'RECONCILED',
        reconciledAt: new Date(),
        reconciledById: actor.userId,
        note: note || null,
      },
    });

    if (hasDiscrepancy) {
      // Alert finance team
      await emitOutboxEvent(EVENTS.COD_DISCREPANCY, 'cod_collection', codId,
        { codId, expected: cod.expectedCents, received: handedOverCents }, tx);
    } else {
      // Post COD handover to ledger
      const { postCodHandover } = await import('../finance/finance.service.js');
      await postCodHandover(codId, tx);
      await emitOutboxEvent(EVENTS.COD_RECONCILED, 'cod_collection', codId,
        { codId, handedOverCents }, tx);
    }

    await recordAudit({ actor, action: 'cod.reconciled', entityType: 'cod_collection', entityId: codId,
      after: { handedOverCents, status: hasDiscrepancy ? 'DISCREPANCY' : 'RECONCILED' } }, tx);
  });
}

export async function createRiderDeduction(riderId, { jobId, amountCents, reason }, actor) {
  // Negative earnings = deductions
  return prisma.riderEarning.create({
    data: {
      riderId,
      jobId: jobId || null,
      amountCents: -Math.abs(amountCents), // always negative
      type: 'DEDUCTION',
      reason,
    },
  });
}
