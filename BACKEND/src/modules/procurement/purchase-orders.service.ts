import type { ItemSourcingStatus, Prisma, PrismaClient, PurchaseOrderStatus } from '@prisma/client';
import type { z } from 'zod';
import { AppError } from '../../shared/errors/app-error';
import { emitEvent } from '../../shared/events/outbox';
import { nextPoNumber } from '../../shared/ids/numbers';
import { generateNumericCode, hmacCode } from '../../shared/crypto/tokens';
import { toPage } from '../../shared/pagination';
import { can, type Actor } from '../../shared/auth/actor';
import { recordAudit } from '../audit/audit.service';
import { checkPriceFloor } from '../catalog/pricing.domain';
import type { OrdersService } from '../orders/orders.service';
import { poMachine } from './procurement.domain';
import type { CancelPoBody, PoListQuery, ReactivePoBody, RestockPoBody, SupplierResponseBody } from './procurement.schemas';

type Tx = Prisma.TransactionClient;

export const poInclude = {
  supplier: true,
  items: { orderBy: { description: 'asc' } },
  grns: { include: { lines: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.PurchaseOrderInclude;
export type PoWithDetails = Prisma.PurchaseOrderGetPayload<{ include: typeof poInclude }>;

const WAITING: ItemSourcingStatus[] = ['AWAITING_PO', 'FAILED'];

export class PurchaseOrdersService {
  constructor(
    private readonly db: PrismaClient,
    private readonly orders: OrdersService,
  ) {}

  /** The only way a PO's status changes: state machine + compare-and-set on version. */
  async transition(tx: Tx, po: { id: string; status: PurchaseOrderStatus; version: number }, to: PurchaseOrderStatus, data: Prisma.PurchaseOrderUpdateManyMutationInput = {}) {
    poMachine.assertTransition(po.status, to);
    const res = await tx.purchaseOrder.updateMany({
      where: { id: po.id, status: po.status, version: po.version },
      data: { ...data, status: to, version: { increment: 1 } },
    });
    if (res.count === 0) throw new AppError('CONFLICT', 'The purchase order was changed by someone else. Reload and try again.');
    await emitEvent(tx, { type: 'po.status_changed', aggregateType: 'purchase_order', aggregateId: po.id, payload: { poId: po.id, from: po.status, to } });
  }

  // ═════════════ Sourcing queue ═════════════

  /** Customer order lines waiting for a supplier, most urgent first. */
  async sourcingQueue() {
    const items = await this.db.orderItem.findMany({
      where: { source: 'SOURCED', sourcingStatus: { in: WAITING }, order: { status: 'SOURCING' } },
      include: { order: { select: { number: true, promisedBy: true, contactName: true, createdAt: true } } },
      orderBy: [{ readyBy: 'asc' }],
      take: 200,
    });
    const counts = await this.db.supplierCatalogItem.groupBy({
      by: ['productId'],
      where: { productId: { in: items.map((i) => i.productId) }, availability: { not: 'OUT' }, supplier: { status: 'ACTIVE' } },
      _count: true,
    });
    const countBy = new Map(counts.map((c) => [c.productId, c._count]));
    return items.map((i) => ({
      orderItemId: i.id, orderNumber: i.order.number, customer: i.order.contactName, productId: i.productId,
      sku: i.sku, name: i.name, quantity: i.quantity, sourcingStatus: i.sourcingStatus,
      promisedBy: i.order.promisedBy, supplierOptions: countBy.get(i.productId) ?? 0,
    }));
  }

  // ═════════════ Create ═════════════

  /** BR-003: a reactive PO is always tied to paid customer order lines. */
  async createReactive(input: z.infer<typeof ReactivePoBody>, actor: Actor) {
    const supplier = await this.activeSupplier(input.supplierId);
    const items = await this.db.orderItem.findMany({ where: { id: { in: input.orderItemIds } }, include: { order: true } });
    if (items.length !== input.orderItemIds.length) throw new AppError('NOT_FOUND', 'One or more order lines were not found');

    const catalog = await this.db.supplierCatalogItem.findMany({
      where: { supplierId: supplier.id, productId: { in: items.map((i) => i.productId) } },
    });
    const priceOf = new Map(catalog.map((c) => [c.productId, c]));

    const lines = items.map((item) => {
      if (item.source !== 'SOURCED' || !WAITING.includes(item.sourcingStatus) || item.order.status !== 'SOURCING') {
        throw new AppError('CONFLICT', `${item.sku} on ${item.order.number} is not waiting for a supplier`);
      }
      const cat = priceOf.get(item.productId);
      const unitCostCents = input.unitCosts?.[item.id] ?? cat?.costCents;
      if (unitCostCents == null) {
        throw new AppError('VALIDATION_FAILED', `${supplier.name} has no price for ${item.sku}. Add it to their price list or send unitCosts.`);
      }
      // BR-004: buying at this price must not make the customer's sale a loss.
      const floor = checkPriceFloor({ sellingPriceCents: item.unitPriceCents, vatRateBps: item.vatRateBps, costCents: unitCostCents });
      if (floor === 'BLOCK_BELOW_COST' && !can(actor, 'finance:approve_below_cost')) {
        throw new AppError('PRICE_BELOW_MARGIN_FLOOR', `${item.sku}: this cost is above what the customer paid (ex-VAT). Finance approval required.`);
      }
      if (floor === 'WARN_BELOW_MARGIN' && !input.acknowledgeMarginWarning) {
        throw new AppError('PRICE_BELOW_MARGIN_FLOOR', `${item.sku}: margin below the minimum. Send acknowledgeMarginWarning: true to continue.`);
      }
      return {
        productId: item.productId, orderItemId: item.id, partNumber: cat?.partNumber ?? item.sku,
        description: item.name, quantity: item.quantity, unitCostCents,
      };
    });

    const po = await this.db.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({
        data: {
          number: await nextPoNumber(tx), supplierId: supplier.id, kind: 'REACTIVE', createdById: actor.userId,
          notes: input.notes ?? null, totalCostCents: lines.reduce((s, l) => s + l.unitCostCents * l.quantity, 0),
          items: { create: lines },
        },
      });
      await recordAudit(tx, { actorId: actor.userId, action: 'po.created', entityType: 'purchase_order', entityId: created.id, after: { number: created.number, kind: 'REACTIVE' }, ip: actor.ip, requestId: actor.requestId });
      return created;
    });
    return this.detail(po.number);
  }

  /** Proactive stock build — must be approved before it can be sent (BR-003). */
  async createRestock(input: z.infer<typeof RestockPoBody>, actor: Actor) {
    const supplier = await this.activeSupplier(input.supplierId);
    const products = await this.db.product.findMany({ where: { id: { in: input.lines.map((l) => l.productId) } } });
    if (products.length !== new Set(input.lines.map((l) => l.productId)).size) throw new AppError('NOT_FOUND', 'One or more products were not found');
    const byId = new Map(products.map((p) => [p.id, p]));

    const po = await this.db.$transaction(async (tx) =>
      tx.purchaseOrder.create({
        data: {
          number: await nextPoNumber(tx), supplierId: supplier.id, kind: 'RESTOCK', createdById: actor.userId,
          notes: input.notes ?? null, totalCostCents: input.lines.reduce((s, l) => s + l.unitCostCents * l.quantity, 0),
          items: {
            create: input.lines.map((l) => ({
              productId: l.productId, partNumber: byId.get(l.productId)!.sku, description: byId.get(l.productId)!.name,
              quantity: l.quantity, unitCostCents: l.unitCostCents,
            })),
          },
        },
      }),
    );
    return this.detail(po.number);
  }

  // ═════════════ Approve & send ═════════════

  async submitForApproval(number: string) {
    const po = await this.mustFind(number);
    if (po.kind !== 'RESTOCK') throw new AppError('VALIDATION_FAILED', 'Only restock POs need approval');
    await this.db.$transaction((tx) => this.transition(tx, po, 'PENDING_APPROVAL'));
    return this.detail(number);
  }

  async approve(number: string, actor: Actor) {
    const po = await this.mustFind(number);
    if (po.createdById === actor.userId) throw new AppError('FORBIDDEN', 'You cannot approve a purchase order you created');
    await this.db.$transaction(async (tx) => {
      await this.transition(tx, po, 'APPROVED', { approvedById: actor.userId });
      await recordAudit(tx, { actorId: actor.userId, action: 'po.approved', entityType: 'purchase_order', entityId: po.id, ip: actor.ip, requestId: actor.requestId });
    });
    return this.detail(number);
  }

  async send(number: string, channel: 'PORTAL' | 'EMAIL' | 'WHATSAPP' | 'PHONE', actor: Actor) {
    const po = await this.mustFind(number);
    if (po.kind === 'RESTOCK' && po.status !== 'APPROVED') throw new AppError('APPROVAL_REQUIRED', 'Restock purchase orders must be approved before sending');
    await this.db.$transaction(async (tx) => {
      const lines = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id, orderItemId: { not: null } } });
      const orderItemIds = lines.map((l) => l.orderItemId!);
      const stillWaiting = await tx.orderItem.count({ where: { id: { in: orderItemIds }, sourcingStatus: { in: WAITING } } });
      if (stillWaiting !== orderItemIds.length) throw new AppError('CONFLICT', 'Some order lines on this PO were already supplied. Cancel this PO and create a new one.');

      await this.transition(tx, po, 'SENT', { sentVia: channel, sentAt: new Date() });
      await tx.orderItem.updateMany({ where: { id: { in: orderItemIds } }, data: { sourcingStatus: 'PO_SENT' } });
      // The notifications step turns this event into an email / WhatsApp to the supplier.
      await emitEvent(tx, { type: 'po.sent', aggregateType: 'purchase_order', aggregateId: po.id, payload: { poId: po.id, number: po.number, channel } });
      await recordAudit(tx, { actorId: actor.userId, action: 'po.sent', entityType: 'purchase_order', entityId: po.id, after: { channel }, ip: actor.ip, requestId: actor.requestId });
    });
    return this.detail(number);
  }

  // ═════════════ Supplier answers (staff logs it; the supplier portal will call the same method) ═════════════

  async recordSupplierResponse(number: string, input: z.infer<typeof SupplierResponseBody>, actor: Actor) {
    const po = await this.mustFind(number);
    if (po.status !== 'SENT') throw new AppError('INVALID_STATE_TRANSITION', `This PO is ${po.status}, not waiting for the supplier`);
    let collectionCode: string | null = null;

    await this.db.$transaction(async (tx) => {
      if (input.response === 'REJECTED') {
        await this.transition(tx, po, 'REJECTED_BY_SUPPLIER', { rejectionReason: input.reason });
        await this.releaseOrderLines(tx, po.items.map((i) => i.id));
        await emitEvent(tx, { type: 'alert.po_rejected', aggregateType: 'purchase_order', aggregateId: po.id, payload: { poId: po.id, number: po.number, reason: input.reason } });
        return;
      }

      // Confirmed quantities per line
      const confirmed = new Map(po.items.map((i) => [i.id, i.quantity]));
      if (input.response === 'PARTIAL') {
        for (const l of input.lines) {
          const item = po.items.find((i) => i.id === l.itemId);
          if (!item) throw new AppError('VALIDATION_FAILED', `Line ${l.itemId} is not on this PO`);
          if (l.confirmedQty > item.quantity) throw new AppError('VALIDATION_FAILED', `Cannot confirm more than ${item.quantity} for ${item.partNumber}`);
          // A customer's order line is supplied whole or not at all (keeps sourcing simple and honest).
          if (item.orderItemId && l.confirmedQty !== 0 && l.confirmedQty !== item.quantity) {
            throw new AppError('VALIDATION_FAILED', `${item.partNumber} is for a customer order: confirm all ${item.quantity} or none`);
          }
          confirmed.set(item.id, l.confirmedQty);
        }
        if ([...confirmed.values()].every((q) => q === 0)) throw new AppError('VALIDATION_FAILED', 'Nothing confirmed — record this as REJECTED instead');
      }

      collectionCode = generateNumericCode(6);
      const fully = [...confirmed.entries()].every(([id, q]) => q === po.items.find((i) => i.id === id)!.quantity);
      await this.transition(tx, po, fully ? 'CONFIRMED_BY_SUPPLIER' : 'PARTIALLY_CONFIRMED', {
        confirmedAt: new Date(),
        supplierReadyAt: input.readyAt ?? null,
        collectionCodeHash: hmacCode(`${po.id}:${collectionCode}`),
      });
      for (const [itemId, qty] of confirmed) await tx.purchaseOrderItem.update({ where: { id: itemId }, data: { confirmedQty: qty } });

      const declined = po.items.filter((i) => confirmed.get(i.id) === 0).map((i) => i.id);
      await this.releaseOrderLines(tx, declined);

      const confirmedOrderItems = po.items.filter((i) => i.orderItemId && confirmed.get(i.id)! > 0).map((i) => i.orderItemId!);
      await tx.orderItem.updateMany({ where: { id: { in: confirmedOrderItems } }, data: { sourcingStatus: 'SUPPLIER_CONFIRMED' } });
      for (const orderId of await this.orderIdsOf(tx, confirmedOrderItems)) {
        await this.orders.addTimelineEvent(tx, orderId, 'Part confirmed with our supplier — arranging collection');
      }
    });

    await recordAudit(this.db, { actorId: actor.userId, action: 'po.supplier_response', entityType: 'purchase_order', entityId: po.id, after: { response: input.response }, ip: actor.ip, requestId: actor.requestId });
    // The collection code is shown ONCE: give it to the rider; the supplier hands over only to someone who quotes it.
    return { po: await this.detail(number), collectionCode };
  }

  async cancel(number: string, input: z.infer<typeof CancelPoBody>, actor: Actor) {
    const po = await this.mustFind(number);
    if (po.items.some((i) => i.receivedQty > 0)) throw new AppError('CONFLICT', 'Goods were already received on this PO');
    await this.db.$transaction(async (tx) => {
      await this.transition(tx, po, 'CANCELLED', { notes: `${po.notes ?? ''}\nCancelled: ${input.reason}`.trim() });
      await this.releaseOrderLines(tx, po.items.map((i) => i.id));
      await recordAudit(tx, { actorId: actor.userId, action: 'po.cancelled', entityType: 'purchase_order', entityId: po.id, reason: input.reason, ip: actor.ip, requestId: actor.requestId });
    });
    return this.detail(number);
  }

  // ═════════════ Read ═════════════

  async list(q: z.infer<typeof PoListQuery>) {
    const rows = await this.db.purchaseOrder.findMany({
      where: { ...(q.status ? { status: q.status as PurchaseOrderStatus } : {}), ...(q.supplierId ? { supplierId: q.supplierId } : {}) },
      include: { supplier: { select: { code: true, name: true } }, _count: { select: { items: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    return toPage(rows, q.limit);
  }

  async detail(number: string) {
    const po = await this.db.purchaseOrder.findUnique({ where: { number }, include: poInclude });
    if (!po) throw new AppError('NOT_FOUND', 'Purchase order not found');
    return po;
  }

  // ── helpers ──

  private async mustFind(number: string) {
    const po = await this.db.purchaseOrder.findUnique({ where: { number }, include: { items: true } });
    if (!po) throw new AppError('NOT_FOUND', 'Purchase order not found');
    return po;
  }

  private async activeSupplier(id: string) {
    const s = await this.db.supplier.findUnique({ where: { id } });
    if (!s) throw new AppError('NOT_FOUND', 'Supplier not found');
    if (s.status !== 'ACTIVE') throw new AppError('CONFLICT', `${s.name} is ${s.status.toLowerCase()} and cannot receive POs`);
    return s;
  }

  /** PO lines that won't be supplied: their customer order lines go back to the sourcing queue. */
  private async releaseOrderLines(tx: Tx, poItemIds: string[]) {
    if (poItemIds.length === 0) return;
    const lines = await tx.purchaseOrderItem.findMany({ where: { id: { in: poItemIds }, orderItemId: { not: null } } });
    const orderItemIds = lines.map((l) => l.orderItemId!);
    await tx.orderItem.updateMany({ where: { id: { in: orderItemIds }, sourcingStatus: { not: 'RECEIVED' } }, data: { sourcingStatus: 'AWAITING_PO' } });
    await tx.purchaseOrderItem.updateMany({ where: { id: { in: lines.map((l) => l.id) } }, data: { orderItemId: null } });
  }

  private async orderIdsOf(tx: Tx, orderItemIds: string[]) {
    const rows = await tx.orderItem.findMany({ where: { id: { in: orderItemIds } }, select: { orderId: true }, distinct: ['orderId'] });
    return rows.map((r) => r.orderId);
  }
}
