import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export type AuditEntry = {
  actorId?: string | null;
  actorRole?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  action: string; // e.g. "auth.2fa_enabled", "order.status_changed"
  entityType: string; // e.g. "user", "order"
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  requestId?: string | null;
};

const json = (v: unknown) => (v === undefined ? undefined : (v as Prisma.InputJsonValue));

/**
 * Write one audit row. Pass the transaction client (`tx`) when the audited change
 * happens inside a transaction, so the change and its audit row commit together.
 */
export async function recordAudit(db: Db, entry: AuditEntry) {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      actorRole: entry.actorRole ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: json(entry.before),
      after: json(entry.after),
      reason: entry.reason ?? null,
      requestId: entry.requestId ?? null,
    },
  });
}
