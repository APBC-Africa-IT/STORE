import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Write a domain event in the SAME transaction as the business change.
 * A background worker (later step) publishes these to queues: notifications,
 * websockets, search index, finance… "If the change committed, the event exists."
 */
export async function emitEvent(
  db: Db,
  event: { type: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown> },
) {
  await db.outboxEvent.create({
    data: {
      type: event.type,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload as Prisma.InputJsonValue,
    },
  });
}
