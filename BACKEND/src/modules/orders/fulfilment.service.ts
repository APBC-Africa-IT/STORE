import type { DeliveryMethod, OrderChannel, OrderStatus, PaymentStatus, Prisma, PrismaClient } from '@prisma/client';
import { AppError } from '../../shared/errors/app-error';
import { toPage } from '../../shared/pagination';
import type { Actor } from '../../shared/auth/actor';
import { recordAudit } from '../audit/audit.service';
import type { InventoryService } from '../inventory/inventory.service';
import type { OrdersService } from './orders.service';

export const staffOrderInclude = {
  items: true,
  statusHistory: { orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { createdAt: 'asc' } },
  notes: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;
export type StaffOrder = Prisma.OrderGetPayload<{ include: typeof staffOrderInclude }>;

export type AdminOrderFilters = {
  status?: OrderStatus | undefined;
  channel?: OrderChannel | undefined;
  paymentStatus?: PaymentStatus | undefined;
  deliveryMethod?: DeliveryMethod | undefined;
  q?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  limit: number;
  cursor?: string | undefined;
};

/** Staff-side order handling: list, detail, pick/pack, collection, handover, cancel, notes. */
export class FulfilmentService {
  constructor(
    private readonly db: PrismaClient,
    private readonly orders: OrdersService,
    private readonly inventory: InventoryService,
  ) {}

  async list(f: AdminOrderFilters) {
    const where: Prisma.OrderWhereInput = {
      ...(f.status ? { status: f.status } : {}),
      ...(f.channel ? { channel: f.channel } : {}),
      ...(f.paymentStatus ? { paymentStatus: f.paymentStatus } : {}),
      ...(f.deliveryMethod ? { deliveryMethod: f.deliveryMethod } : {}),
      ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
      ...(f.q
        ? {
            OR: [
              { number: { contains: f.q, mode: 'insensitive' } },
              { contactName: { contains: f.q, mode: 'insensitive' } },
              { contactPhone: { contains: f.q.replace(/\D/g, '') || f.q } },
            ],
          }
        : {}),
    };
    const rows = await this.db.order.findMany({
      where,
      include: { items: { select: { quantity: true, source: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: f.limit + 1,
      ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
    });
    return toPage(rows, f.limit);
  }

  async detail(number: string) {
    const order = await this.db.order.findUnique({ where: { number }, include: staffOrderInclude });
    if (!order) throw new AppError('NOT_FOUND', 'Order not found');
    return { order, bins: await this.binsFor(order.items.map((i) => i.productId)) };
  }

  /** Orders waiting to be picked, most urgent first, with the shelf location of every part. */
  async pickingQueue() {
    const orders = await this.db.order.findMany({
      where: { status: 'PICKING' },
      include: { items: true },
      orderBy: [{ promisedBy: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: 200,
    });
    const bins = await this.binsFor(orders.flatMap((o) => o.items.map((i) => i.productId)));
    return orders.map((o) => ({
      number: o.number,
      deliveryMethod: o.deliveryMethod,
      promisedBy: o.promisedBy,
      customer: o.contactName,
      items: o.items.map((i) => ({ sku: i.sku, name: i.name, quantity: i.quantity, bin: bins.get(i.productId) ?? null })),
    }));
  }

  /** Picked, quality-checked and packed in MySpares packaging. */
  async pack(number: string, actor: Actor) {
    const order = await this.mustFind(number);
    await this.db.$transaction((tx) =>
      this.orders.transition(tx, order, 'PACKED', {
        actorId: actor.userId,
        note: 'Picked, quality-checked and packed',
        data: { packedAt: new Date(), packedById: actor.userId },
      }),
    );
    return this.detail(number);
  }

  /** Click & collect: tell the customer their parcel is waiting at the shop. */
  async readyForCollection(number: string, actor: Actor) {
    const order = await this.mustFind(number);
    if (order.deliveryMethod !== 'CLICK_AND_COLLECT') {
      throw new AppError('VALIDATION_FAILED', 'Only click & collect orders wait for collection. Delivery orders are dispatched with a rider.');
    }
    await this.db.$transaction((tx) => this.orders.transition(tx, order, 'READY_FOR_COLLECTION', { actorId: actor.userId }));
    return this.detail(number);
  }

  /** Customer collects at the counter. Must be fully paid; stock becomes SOLD. */
  async handover(number: string, actor: Actor) {
    const order = await this.mustFind(number);
    if (order.amountPaidCents < order.totalCents) {
      throw new AppError('CONFLICT', `Collect the balance first: ${(order.totalCents - order.amountPaidCents) / 100} KES is still due`);
    }
    await this.db.$transaction(async (tx) => {
      await this.orders.transition(tx, order, 'COMPLETED', {
        actorId: actor.userId,
        note: 'Handed over at the counter',
        data: { completedAt: new Date() },
      });
      await this.orders.commitOrderStock(tx, order, actor.userId);
    });
    return this.detail(number);
  }

  async cancel(number: string, reason: string, actor: Actor) {
    const order = await this.mustFind(number);
    await this.db.$transaction(async (tx) => {
      await this.orders.cancel(tx, order, { reason, actorId: actor.userId });
      await recordAudit(tx, {
        actorId: actor.userId, action: 'order.cancelled', entityType: 'order', entityId: order.id,
        before: { status: order.status }, reason, ip: actor.ip, requestId: actor.requestId,
      });
    });
    return this.detail(number);
  }

  async addNote(number: string, body: string, actor: Actor) {
    const order = await this.mustFind(number);
    await this.db.orderNote.create({ data: { orderId: order.id, authorId: actor.userId, body } });
    return this.detail(number);
  }

  // ── helpers ──

  private async mustFind(number: string) {
    const order = await this.db.order.findUnique({ where: { number } });
    if (!order) throw new AppError('NOT_FOUND', 'Order not found');
    return order;
  }

  private async binsFor(productIds: string[]) {
    if (productIds.length === 0) return new Map<string, string>();
    const locationId = await this.inventory.defaultLocationId();
    const levels = await this.db.inventoryLevel.findMany({
      where: { productId: { in: [...new Set(productIds)] }, locationId, binId: { not: null } },
      include: { bin: true },
    });
    return new Map(levels.map((l) => [l.productId, l.bin!.code]));
  }
}
