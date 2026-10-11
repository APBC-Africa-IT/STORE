/**
 * Audit service — write and query the append-only audit_logs table.
 * recordAudit must be called inside the same DB transaction as the change it records.
 */
import { prisma as defaultPrisma } from '../../shared/db/prisma.js';

/**
 * Record an audit entry inside an existing transaction (or standalone).
 *
 * @param {{
 *   actor: { userId?:string, role?:string, ip?:string, userAgent?:string },
 *   action: string,
 *   entityType: string,
 *   entityId?: string,
 *   before?: object,
 *   after?: object,
 *   reason?: string,
 *   requestId?: string
 * }} opts
 * @param {object} tx - Prisma transaction client (use the same tx as the surrounding operation)
 */
export async function recordAudit(opts, tx = defaultPrisma) {
  const { actor = {}, action, entityType, entityId, before, after, reason, requestId } = opts;
  try {
    await tx.auditLog.create({
      data: {
        actorId:    actor.userId   || null,
        actorRole:  actor.role     || null,
        ip:         actor.ip       || null,
        userAgent:  actor.userAgent || null,
        action,
        entityType,
        entityId:   entityId || null,
        before:     before   || undefined,
        after:      after    || undefined,
        reason:     reason   || null,
        requestId:  requestId || null,
      },
    });
  } catch (e) {
    // Audit failures must never crash a business transaction
    console.error('[audit] Failed to write audit log:', e.message, { action, entityType, entityId });
  }
}

/**
 * Query audit logs (admin only — read-only).
 * @param {{ entityType?:string, entityId?:string, actorId?:string, from?:Date, to?:Date, page?:number, pageSize?:number }}
 */
export async function queryAuditLogs({ entityType, entityId, actorId, action, from, to, page = 1, pageSize = 50 }) {
  const where = {};
  if (entityType) where.entityType = entityType;
  if (entityId)   where.entityId   = entityId;
  if (actorId)    where.actorId    = actorId;
  if (action)     where.action     = { contains: action };
  if (from || to) where.createdAt  = {};
  if (from)       where.createdAt.gte = new Date(from);
  if (to)         where.createdAt.lte = new Date(to);

  const [logs, total] = await Promise.all([
    defaultPrisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    defaultPrisma.auditLog.count({ where }),
  ]);

  return { logs, total, page, pageSize };
}
