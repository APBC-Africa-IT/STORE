import type { Prisma, PrismaClient } from '@prisma/client';
import { AppError } from '../../shared/errors/app-error';
import { emitEvent } from '../../shared/events/outbox';
import { nextGrnNumber } from '../../shared/ids/numbers';
import type { Actor } from '../../shared/auth/actor';
import { recordAudit } from '../audit/audit.service';
import type { InventoryService } from '../inventory/inventory.service';
import type { OrdersService } from '../orders/orders.service';
import { routeAfterConfirm } from '../orders/order.domain';
import { landedUnitCosts, RECEIVABLE_PO_STATUSES, weightedAverageCost } from './procurement.domain';
import type { PurchaseOrdersService } from './purchase-orders.service';
import type { GrnBody } from './procurement.schemas';

type Tx = Prisma.TransactionClient;

/**
 * Goods arrive at the hub from a supplier.
 * BR-012: only parts that PASS the quality check go into stock and get allocated to customers.
 */
export class GrnService {
  constructor(
    private readonly db: PrismaClient,
    private readonly inventory: InventoryService,
    private readonly orders: OrdersService,
    private readonly pos: PurchaseOrdersService,
  ) {}

  async receive(input: GrnBody, actor: Actor) {
    const po = await this.db.purchaseOrder.findUnique({ where: { number: input.purchaseOrderNumber }, include: { items: true } });
    if (!po) throw new AppError('NOT_FOUND', 'Purchase order not found');
    if (!RECEIVABLE_PO_STATUSES.includes(po.status)) {
      throw new AppError('INVALID_STATE_TRANSITION', `Cannot receive goods on a PO that is ${po.status}`);
    }

    // Validate every line against what is still outstanding on the PO.
    const lines = input.lines.map((l) => {
      const item = po.items.find((i) => i.id === l.purchaseOrderItemId);
      if (!item) throw new AppError('VALIDATION_FAILED', 'A line is not on this purchase order');
      const outstanding = (item.confirmedQty ?? item.quantity) - item.receivedQty;
      if (l.receivedQty > outstanding) throw new AppError('VALIDATION_FAILED', `${item.partNumber}: only ${outstanding} outstanding`);
      return { ...l, item, rejectedQty: l.receivedQty - l.acceptedQty };
    });
    if (lines.every((l) => l.receivedQty === 0)) throw new AppError('VALIDATION_FAILED', 'Nothing was received');

    const landed = landedUnitCosts(
      lines.map((l) => ({ unitCostCents: l.item.unitCostCents, acceptedQty: l.acceptedQty })),
      input.collectionFeeCents + input.otherCostsCents,
    );
    const totalAccepted = lines.reduce((n, l) => n + l.acceptedQty, 0);
    const totalReceived = lines.reduce((n, l) => n + l.receivedQty, 0);
    const status = totalAccepted === totalReceived ? 'PASSED' : totalAccepted > 0 ? 'PARTIAL_PASS' : 'FAILED';

    const grnNumber = await this.db.$transaction(
      async (tx) => {
        const grn = await tx.grn.create({
          data: {
            number: await nextGrnNumber(tx), purchaseOrderId: po.id, status, receivedById: actor.userId, notes: input.notes ?? null,
            lines: {
              create: lines.map((l, i) => ({
                purchaseOrderItemId: l.item.id, receivedQty: l.receivedQty, acceptedQty: l.acceptedQty, rejectedQty: l.rejectedQty,
                landedUnitCostCents: landed[i]!, checks: l.checks, rejectionReason: l.rejectionReason ?? null,
              })),
            },
          },
        });

        const touchedOrders = new Set<string>();
        const receivedProducts = new Set<string>();

        for (const [i, l] of lines.entries()) {
          await tx.purchaseOrderItem.update({ where: { id: l.item.id }, data: { receivedQty: { increment: l.receivedQty } } });
          if (l.acceptedQty > 0) {
            await this.stockIn(tx, l.item.productId, l.acceptedQty, landed[i]!, grn.number, actor.userId);
            receivedProducts.add(l.item.productId);
          }
          if (l.item.orderItemId) {
            const orderId = await this.settleCustomerLine(tx, l.item.orderItemId, l.acceptedQty, landed[i]!, l.item.id);
            touchedOrders.add(orderId);
          }
        }

        // Anything extra (restock, or a partial delivery) may serve other customers who are waiting.
        for (const productId of receivedProducts) {
          for (const orderId of await this.allocateToWaitingOrders(tx, productId)) touchedOrders.add(orderId);
        }

        // Customer orders whose parts are all here move on to picking.
        for (const orderId of touchedOrders) await this.advanceOrder(tx, orderId, actor.userId);

        // PO bookkeeping
        const items = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
        const allIn = items.every((it) => it.receivedQty >= (it.confirmedQty ?? it.quantity));
        await tx.purchaseOrder.update({
          where: { id: po.id },
          data: { collectionFeeCents: { increment: input.collectionFeeCents }, otherCostsCents: { increment: input.otherCostsCents } },
        });
        if (allIn) {
          const fresh = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
          await this.pos.transition(tx, fresh, 'RECEIVED');
        }

        await emitEvent(tx, { type: 'grn.completed', aggregateType: 'grn', aggregateId: grn.id, payload: { grnId: grn.id, poId: po.id, status } });
        if (status !== 'PASSED') {
          // Supplier owes us a replacement or credit for the rejected parts.
          await emitEvent(tx, { type: 'alert.grn_rejections', aggregateType: 'grn', aggregateId: grn.id, payload: { grnId: grn.id, poNumber: po.number, rejected: totalReceived - totalAccepted } });
        }
        await recordAudit(tx, {
          actorId: actor.userId, action: 'grn.created', entityType: 'purchase_order', entityId: po.id,
          after: { grn: grn.number, status, accepted: totalAccepted, rejected: totalReceived - totalAccepted }, ip: actor.ip, requestId: actor.requestId,
        });
        return grn.number;
      },
      { timeout: 20_000 },
    );

    return this.db.grn.findUniqueOrThrow({ where: { number: grnNumber }, include: { lines: true, purchaseOrder: { select: { number: true, status: true } } } });
  }

  list(poNumber?: string) {
    return this.db.grn.findMany({
      where: poNumber ? { purchaseOrder: { number: poNumber } } : {},
      include: { lines: true, purchaseOrder: { select: { number: true, supplier: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ── helpers ──

  /** Put accepted parts on the shelf at landed cost, and update the product's average/last cost. */
  private async stockIn(tx: Tx, productId: string, qty: number, landedCents: number, grnNumber: string, actorId: string) {
    const product = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { avgCostCents: true } });
    const level = await this.inventory.receive(tx, {
      productId, quantity: qty, reason: 'GRN_RECEIPT', unitCostCents: landedCents,
      referenceType: 'GRN', referenceId: grnNumber, actorId,
    });
    const onHandBefore = level.on_hand - qty;
    await tx.product.update({
      where: { id: productId },
      data: { lastCostCents: landedCents, avgCostCents: weightedAverageCost(onHandBefore, product.avgCostCents, qty, landedCents) },
    });
  }

  /** The PO line was bought for a specific customer line: allocate it if it arrived complete and passed QC. */
  private async settleCustomerLine(tx: Tx, orderItemId: string, acceptedQty: number, landedCents: number, poItemId: string) {
    const item = await tx.orderItem.findUniqueOrThrow({ where: { id: orderItemId } });
    if (acceptedQty >= item.quantity) {
      await this.inventory.reserve(tx, { productId: item.productId, quantity: item.quantity, orderItemId: item.id });
      await tx.orderItem.update({ where: { id: item.id }, data: { sourcingStatus: 'RECEIVED', unitCostCents: landedCents } });
    } else {
      // Short or failed QC: the customer line goes back to the sourcing queue (BR-012).
      await tx.orderItem.update({ where: { id: item.id }, data: { sourcingStatus: 'FAILED' } });
      await tx.purchaseOrderItem.update({ where: { id: poItemId }, data: { orderItemId: null } });
      await this.orders.addTimelineEvent(tx, item.orderId, 'We are re-sourcing one of your parts to make sure you get the right one', 'GRN: short or failed quality check');
    }
    return item.orderId;
  }

  /** Give free stock to customers who are still waiting for this part (oldest order first). */
  private async allocateToWaitingOrders(tx: Tx, productId: string) {
    const waiting = await tx.orderItem.findMany({
      where: { productId, source: 'SOURCED', sourcingStatus: { in: ['AWAITING_PO', 'FAILED'] }, order: { status: 'SOURCING' } },
      orderBy: { order: { createdAt: 'asc' } },
    });
    const orderIds: string[] = [];
    for (const item of waiting) {
      if ((await this.inventory.freeStock(tx, productId)) < item.quantity) break;
      await this.inventory.reserve(tx, { productId, quantity: item.quantity, orderItemId: item.id });
      const cost = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { avgCostCents: true } });
      await tx.orderItem.update({ where: { id: item.id }, data: { sourcingStatus: 'RECEIVED', unitCostCents: cost.avgCostCents } });
      orderIds.push(item.orderId);
    }
    return orderIds;
  }

  private async advanceOrder(tx: Tx, orderId: string, actorId: string) {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    if (order.status === 'SOURCING' && routeAfterConfirm(order.items) === 'PICKING') {
      await this.orders.addTimelineEvent(tx, orderId, 'Your part has arrived at our hub and passed our quality check');
      await this.orders.transition(tx, order, 'PICKING', { actorId, note: 'All sourced parts received' });
    }
  }
}
