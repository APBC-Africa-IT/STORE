import type { JobStatus, Prisma } from '@prisma/client';
import { AppError } from '../../shared/errors/app-error';
import { emitEvent } from '../../shared/events/outbox';
import { jobMachine } from './logistics.domain';

/**
 * THE only way a logistics job's status changes (used by the logistics service and by GRN).
 * State machine + compare-and-set on (status, version), history row and outbox event — all in `tx`.
 */
export async function transitionJob(
  tx: Prisma.TransactionClient,
  job: { id: string; status: JobStatus; version: number },
  to: JobStatus,
  opts: { actorId?: string | null; note?: string; data?: Prisma.LogisticsJobUncheckedUpdateManyInput } = {},
) {
  jobMachine.assertTransition(job.status, to);
  const res = await tx.logisticsJob.updateMany({
    where: { id: job.id, status: job.status, version: job.version },
    data: { ...opts.data, status: to, version: { increment: 1 } },
  });
  if (res.count === 0) throw new AppError('CONFLICT', 'The job was changed by someone else. Reload and try again.');
  await tx.logisticsJobEvent.create({
    data: { jobId: job.id, fromStatus: job.status, toStatus: to, actorId: opts.actorId ?? null, note: opts.note ?? null },
  });
  await emitEvent(tx, { type: 'logistics.job_status_changed', aggregateType: 'logistics_job', aggregateId: job.id, payload: { jobId: job.id, from: job.status, to } });
  return { id: job.id, status: to, version: job.version + 1 };
}
