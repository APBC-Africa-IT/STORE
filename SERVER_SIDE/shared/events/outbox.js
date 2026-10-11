/**
 * Outbox service — write domain events inside the same Prisma transaction.
 * The outbox relay worker picks these up and fans them out to BullMQ queues.
 */
import { prisma as defaultPrisma } from '../db/prisma.js';

/**
 * Emit one or more outbox events.
 * Pass a Prisma transaction client (`tx`) when inside a $transaction block.
 *
 * @param {Array<{type, aggregateType, aggregateId, payload}>} events
 * @param {import('@prisma/client').PrismaClient} [tx]
 */
export async function emitOutboxEvents(events, tx = defaultPrisma) {
  if (!events || events.length === 0) return;
  await tx.outboxEvent.createMany({
    data: events.map(e => ({
      type:          e.type,
      aggregateType: e.aggregateType,
      aggregateId:   String(e.aggregateId),
      payload:       e.payload ?? {},
    })),
  });
}

/**
 * Convenience: emit a single event.
 */
export async function emitOutboxEvent(type, aggregateType, aggregateId, payload, tx) {
  return emitOutboxEvents([{ type, aggregateType, aggregateId, payload }], tx);
}

export default emitOutboxEvent;
