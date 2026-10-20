import type { StockMovementReason } from '@prisma/client';
import { AppError } from '../../shared/errors/app-error';
import { emitEvent } from '../../shared/events/outbox';
import { toPage } from '../../shared/pagination';
import type { Actor } from '../../shared/auth/actor';
import { recordAudit } from '../audit/audit.service';
import { computeAvailability, type Availability } from './availability.domain';
import type { Db, InventoryRepository } from './inventory.repository';
import type { AdjustmentBody } from './inventory.schemas';
import type { z } from 'zod';
import type { MovementsQuery } from './inventory.schemas';

type ProductForAvailability = {
  id: string;
  lowStockThreshold: number;
  isSourceable: boolean;
  sourcingLeadTimeMins: number | null;
};

export class InventoryService {
  private defaultLocation: string | null = null;

  constructor(private readonly repo: InventoryRepository) {}

  private get db() {
    return this.repo.db;
  }

  async defaultLocationId(db: Db = this.db): Promise<string> {
    if (this.defaultLocation) return this.defaultLocation;
    const loc = await db.location.findFirst({ where: { isDefault: true } });
    if (!loc) throw new AppError('INTERNAL', 'No default location configured. Run `pnpm db:seed`.');
    this.defaultLocation = loc.id;
    return loc.id;
  }

  // ───────────── Availability (what customers see) ─────────────

  async availabilityFor(products: ProductForAvailability[], now = new Date()): Promise<Map<string, Availability>> {
    const levels = await this.repo.availableByProduct(products.map((p) => p.id));
    return new Map(
      products.map((p) => {
        const level = levels.get(p.id);
        const available = level ? level.onHand - level.reserved : 0;
        return [
          p.id,
          computeAvailability(
            {
              available,
              lowStockThreshold: p.lowStockThreshold,
              isSourceable: p.isSourceable,
              hasSourcingCandidate: p.isSourceable, // procurement step: "a supplier actually stocks it"
              sourcingLeadTimeMins: p.sourcingLeadTimeMins,
            },
            now,
          ),
        ];
      }),
    );
  }

  // ───────────── Reservations (used by orders & POS) ─────────────

  /** Hold stock for an order item. Call inside the order's transaction. */
  async reserve(tx: Db, input: { productId: string; quantity: number; orderItemId?: string; expiresAt?: Date | null }) {
    const locationId = await this.defaultLocationId(tx);
    const level = await this.repo.reserve(tx, input.productId, locationId, input.quantity);
    if (!level) {
      // Use `tx` for every query inside a transaction (another connection could deadlock the pool).
      const current = (await this.repo.availableByProduct([input.productId], tx)).get(input.productId);
      const available = current ? current.onHand - current.reserved : 0;
      throw new AppError('INSUFFICIENT_STOCK', `Only ${available} available`, {
        productId: input.productId, requested: input.quantity, available,
      });
    }
    const reservation = await tx.stockReservation.create({
      data: {
        productId: input.productId,
        locationId,
        quantity: input.quantity,
        orderItemId: input.orderItemId ?? null,
        expiresAt: input.expiresAt ?? null,
      },
    });
    await this.changed(tx, input.productId, level);
    return reservation;
  }

  /** Cancel a hold. Safe to call twice (second call does nothing). */
  async release(tx: Db, reservationId: string) {
    const res = await tx.stockReservation.findUnique({ where: { id: reservationId } });
    if (!res) throw new AppError('NOT_FOUND', 'Reservation not found');
    const claimed = await tx.stockReservation.updateMany({
      where: { id: reservationId, status: 'ACTIVE' },
      data: { status: 'RELEASED' },
    });
    if (claimed.count === 0) return false; // already released or committed
    const level = await this.repo.release(tx, res.productId, res.locationId, res.quantity);
    if (!level) throw new AppError('INTERNAL', 'Reserved stock out of sync');
    await this.changed(tx, res.productId, level);
    return true;
  }

  /** Goods leave the hub: reserved → sold. Writes the SALE movement. */
  async commit(tx: Db, reservationId: string, ref: { referenceType: string; referenceId: string; actorId?: string | null }) {
    const res = await tx.stockReservation.findUnique({ where: { id: reservationId } });
    if (!res) throw new AppError('NOT_FOUND', 'Reservation not found');
    const claimed = await tx.stockReservation.updateMany({
      where: { id: reservationId, status: 'ACTIVE' },
      data: { status: 'COMMITTED', expiresAt: null },
    });
    if (claimed.count === 0) throw new AppError('CONFLICT', 'Reservation is no longer active');
    const level = await this.repo.commit(tx, res.productId, res.locationId, res.quantity);
    if (!level) throw new AppError('INTERNAL', 'Reserved stock out of sync');
    await tx.stockMovement.create({
      data: {
        productId: res.productId, locationId: res.locationId, quantity: -res.quantity, reason: 'SALE',
        referenceType: ref.referenceType, referenceId: ref.referenceId, actorId: ref.actorId ?? null,
      },
    });
    await this.changed(tx, res.productId, level);
  }

  /** Stock arrives (GRN, return…). Call inside the caller's transaction. */
  async receive(
    tx: Db,
    input: { productId: string; quantity: number; reason: StockMovementReason; unitCostCents?: number | null; referenceType?: string; referenceId?: string; note?: string; actorId?: string | null },
  ) {
    const locationId = await this.defaultLocationId(tx);
    const level = await this.repo.receive(tx, input.productId, locationId, input.quantity);
    await tx.stockMovement.create({
      data: {
        productId: input.productId, locationId, quantity: input.quantity, reason: input.reason,
        unitCostCents: input.unitCostCents ?? null, referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null, note: input.note ?? null, actorId: input.actorId ?? null,
      },
    });
    await this.changed(tx, input.productId, level);
    return level;
  }

  // ───────────── Manual adjustments (admin) ─────────────

  async adjust(input: AdjustmentBody, actor: Actor) {
    const product = await this.db.product.findUnique({ where: { id: input.productId } });
    if (!product) throw new AppError('NOT_FOUND', 'Product not found');
    const locationId = await this.defaultLocationId();
    const reason = input.reason as StockMovementReason;

    return this.db.$transaction(async (tx) => {
      let level;
      if (input.quantity > 0) {
        level = await this.repo.receive(tx, product.id, locationId, input.quantity);
      } else {
        level = await this.repo.decrease(tx, product.id, locationId, -input.quantity);
        if (!level) {
          throw new AppError('INSUFFICIENT_STOCK', 'Cannot remove more than the free (unreserved) stock', {
            productId: product.id, requested: -input.quantity,
          });
        }
      }

      const movement = await tx.stockMovement.create({
        data: {
          productId: product.id, locationId, quantity: input.quantity, reason,
          unitCostCents: input.unitCostCents ?? null, referenceType: 'ADJUSTMENT', note: input.note, actorId: actor.userId,
        },
      });
      await recordAudit(tx, {
        actorId: actor.userId, action: 'inventory.adjusted', entityType: 'product', entityId: product.id,
        after: { quantity: input.quantity, reason, onHand: level.on_hand }, reason: input.note,
        ip: actor.ip, requestId: actor.requestId,
      });
      await this.changed(tx, product.id, level);
      return { movement, onHand: level.on_hand, reserved: level.reserved, available: level.on_hand - level.reserved };
    });
  }

  // ───────────── Read models (admin) ─────────────

  async productStock(productId: string) {
    const product = await this.db.product.findUnique({
      where: { id: productId },
      select: { id: true, sku: true, name: true, lowStockThreshold: true, reorderPoint: true, reorderQty: true },
    });
    if (!product) throw new AppError('NOT_FOUND', 'Product not found');
    const [levels, reservations, movements] = await Promise.all([
      this.db.inventoryLevel.findMany({ where: { productId }, include: { location: true, bin: true } }),
      this.db.stockReservation.findMany({ where: { productId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } }),
      this.db.stockMovement.findMany({ where: { productId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    const onHand = levels.reduce((s, l) => s + l.onHand, 0);
    const reserved = levels.reduce((s, l) => s + l.reserved, 0);
    return {
      product,
      totals: { onHand, reserved, available: onHand - reserved },
      levels: levels.map((l) => ({
        location: l.location.code, bin: l.bin?.code ?? null, onHand: l.onHand, reserved: l.reserved, available: l.onHand - l.reserved,
      })),
      reservations,
      movements,
    };
  }

  async lowStock() {
    const rows = await this.repo.lowStock();
    return rows.map((r) => ({
      productId: r.id, sku: r.sku, name: r.name, onHand: r.on_hand, reserved: r.reserved,
      available: r.on_hand - r.reserved, lowStockThreshold: r.low_stock_threshold,
      reorderPoint: r.reorder_point, suggestedReorderQty: Math.max(r.reorder_qty, r.reorder_point - (r.on_hand - r.reserved), 1),
    }));
  }

  async summary(canViewCost: boolean) {
    const s = await this.repo.summary();
    return {
      activeProducts: s.total, inStock: s.in_stock, lowStock: s.low_stock, outOfStock: s.out_of_stock,
      ...(canViewCost ? { stockValueCents: s.stock_value_cents } : {}),
    };
  }

  async movements(q: z.infer<typeof MovementsQuery>) {
    const rows = await this.db.stockMovement.findMany({
      where: {
        ...(q.productId ? { productId: q.productId } : {}),
        ...(q.reason ? { reason: q.reason as StockMovementReason } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: { product: { select: { sku: true, name: true } } },
    });
    return toPage(rows, q.limit);
  }

  // ───────────── Bins ─────────────

  async createBin(code: string) {
    return this.db.bin.create({ data: { code, locationId: await this.defaultLocationId() } });
  }

  async listBins() {
    return this.db.bin.findMany({ where: { locationId: await this.defaultLocationId() }, orderBy: { code: 'asc' } });
  }

  async setBin(productId: string, binId: string | null) {
    const locationId = await this.defaultLocationId();
    if (binId) {
      const bin = await this.db.bin.findUnique({ where: { id: binId } });
      if (!bin || bin.locationId !== locationId) throw new AppError('NOT_FOUND', 'Bin not found');
    }
    return this.db.inventoryLevel.upsert({
      where: { productId_locationId: { productId, locationId } },
      update: { binId },
      create: { productId, locationId, binId },
    });
  }

  // ───────────── helpers ─────────────

  /** Every stock change emits an event (→ live stock on POS/admin screens in a later step). */
  private async changed(tx: Db, productId: string, level: { on_hand: number; reserved: number }) {
    await emitEvent(tx, {
      type: 'inventory.changed',
      aggregateType: 'product',
      aggregateId: productId,
      payload: { productId, onHand: level.on_hand, reserved: level.reserved, available: level.on_hand - level.reserved },
    });
  }
}
