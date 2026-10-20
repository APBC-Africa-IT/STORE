import { z } from 'zod';
import { JobStatus, JobType, JobUrgency, RiderStatus, CodStatus } from '@prisma/client';
import { normalizePhone } from '../../shared/phone';
import { cursorQuery } from '../../shared/pagination';

const phone = z.string().transform((v, ctx) => {
  const n = normalizePhone(v);
  if (!n) {
    ctx.addIssue({ code: 'custom', message: 'Invalid phone number' });
    return z.NEVER;
  }
  return n;
});
const code6 = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code');

// ── Riders ──
export const RiderBody = z.object({
  name: z.string().trim().min(2).max(120),
  phone,
  nationalId: z.string().trim().regex(/^\d{6,10}$/, 'Enter a valid national ID number'),
  bikePlate: z.string().trim().toUpperCase().regex(/^K[A-Z]{2,3}\s?\d{3}[A-Z]?$/, 'Enter a plate like KMFA 123B'),
  mpesaNumber: phone,
  isPreferred: z.boolean().default(false),
});
export const RiderUpdateBody = RiderBody.partial();
export const RiderStatusBody = z.object({ status: z.enum(RiderStatus), reason: z.string().trim().min(3).max(300) });
export const DutyBody = z.object({ isOnDuty: z.boolean() });
export const RiderListQuery = z.object({ status: z.enum(RiderStatus).optional(), onDuty: z.enum(['true', 'false']).optional() });
export const AdjustmentBody = z.object({
  type: z.enum(['BONUS', 'DEDUCTION']),
  amountCents: z.number().int().positive(), // always positive; DEDUCTION is stored negative
  reason: z.string().trim().min(3).max(300),
});
export const EarningsQuery = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });

// ── Jobs ──
export const CollectionJobBody = z.object({
  purchaseOrderNumber: z.string().regex(/^PO-\d{4}-\d{5,}$/),
  riderId: z.uuid().optional(), // assign straight away
  urgency: z.enum(JobUrgency).default('NORMAL'),
  instructions: z.string().trim().max(500).optional(),
});
export const DeliveryJobBody = z.object({
  orderNumber: z.string().regex(/^ORD-\d{6}-\d{5,}$/),
  riderId: z.uuid().optional(),
  urgency: z.enum(JobUrgency).default('NORMAL'),
  instructions: z.string().trim().max(500).optional(),
});
export const AssignBody = z.object({ riderId: z.uuid() });
export const CollectBody = z.object({ code: code6 }); // the code the rider quoted to the supplier
export const DeliverBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('OTP'), code: code6 }), // customer reads their SMS code to the rider
  z.object({ type: z.literal('PHOTO'), photoUrl: z.url(), recipientName: z.string().trim().min(2).max(120) }),
]);
export const ReasonBody = z.object({ reason: z.string().trim().min(3).max(300) });
export const JobListQuery = z.object({
  type: z.enum(JobType).optional(),
  status: z.enum(JobStatus).optional(),
  riderId: z.uuid().optional(),
  ...cursorQuery,
});
export const JobParams = z.object({ number: z.string().regex(/^JOB-\d{6}-\d{5,}$/, 'Invalid job number') });

// ── COD ──
export const CodListQuery = z.object({ status: z.enum(CodStatus).optional(), riderId: z.uuid().optional() });
export const ReconcileBody = z.object({ handedOverCents: z.number().int().min(0), note: z.string().trim().max(500).optional() });
