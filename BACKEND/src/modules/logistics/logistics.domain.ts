// Pure logistics rules: job status machine, rider fee lookup, COD outcome. No I/O.

import type { JobStatus, JobType } from '@prisma/client';
import { defineMachine } from '../../shared/state-machine/state-machine';
import { AppError } from '../../shared/errors/app-error';

export const jobMachine = defineMachine<JobStatus>('Logistics job', {
  CREATED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['EN_ROUTE', 'CANCELLED'],
  EN_ROUTE: ['COLLECTED', 'DELIVERED', 'FAILED'],
  COLLECTED: ['AT_HUB'],
  AT_HUB: ['CONFIRMED'],
  FAILED: ['RETURNED'],
  DELIVERED: [],
  RETURNED: [],
  CONFIRMED: [],
  CANCELLED: [],
});

/** Jobs that keep a rider busy (count towards the max-jobs limit). */
export const BUSY_STATUSES: JobStatus[] = ['ASSIGNED', 'EN_ROUTE', 'COLLECTED'];

/** Some steps only make sense for one kind of job (you can't "collect" a delivery). */
export function assertJobType(job: { type: JobType; number: string }, type: JobType) {
  if (job.type !== type) {
    throw new AppError('VALIDATION_FAILED', `${job.number} is a ${job.type.toLowerCase()} job, not a ${type.toLowerCase()} job`);
  }
}

/** Rider pay for a trip to/from an area: the delivery zone with the same name, else the default fee. */
export function riderFeeFor(area: string, zones: Array<{ name: string; riderFeeCents: number }>, defaultFeeCents: number) {
  const a = area.trim().toLowerCase();
  const zone = zones.find((z) => z.name.trim().toLowerCase() === a);
  return zone ? zone.riderFeeCents : defaultFeeCents;
}

/** Counted cash vs. what the rider should hand in. */
export function codOutcome(expectedCents: number, handedOverCents: number) {
  const shortCents = expectedCents - handedOverCents;
  return { status: shortCents === 0 ? ('RECONCILED' as const) : ('DISCREPANCY' as const), shortCents };
}

/** "12345678" → "5678" (staff recognise a rider without seeing the full ID number). */
export const last4 = (value: string) => value.replace(/\s/g, '').slice(-4);
