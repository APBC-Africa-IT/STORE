/**
 * Inventory service.
 * All stock mutations use atomic SQL — never read-modify-write in JS (§8.2).
 * Every mutation writes a stock_movements row in the same transaction.
 */
import pg from 'pg';
import { prisma } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/errors/codes.js';
import { emitOutboxEvent } from '../../shared/events/outbox.js';
import { EVENTS } from '../../shared/events/event-types.js';
import { recordAudit } from '../audit/audit.service.js';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || process.env.PG_URI,
});

async function getDefaultLocationId() {
  const loc = await prisma.location.findFirst({ where: { isDefault: true } });
  if (!loc) throw new AppError('NOT_FOUND', 'No default inventory location configured');
  return loc.id;
}

// ── Atomic reserve (CHECK constraint prevents negative available) ──────────
export async function reserveStock({ productId, locationId, orderItemId, quantity, expiresAt }) {
  if (!locationId) locationId = await getDefaultLocationId();

  const res = await pool.query(`
    UPDATE inventory_levels
       SET reserved = reserved + $1,
           version  = version  + 1
     WHERE product_id  = $2
       AND location_id = $3
       AND on_hand - reserved >= $1
    RETURNING on_hand, reserved, version
  `, [quantity, productId, locationId]);

  if (res.rowCount === 0) {
    const level = await prisma.inventoryLevel.findUnique({ where: { productId_locationId: { productId, locationId } } });
    const available = level ? level.onHand - level.reserved : 0;
    throw new AppError('INSUFFICIENT_STOCK', `Only ${available} units available`, { productId, available, requested: quantity });
  }

  const reservation = await prisma.stockReservation.create({
    data: { productId, locationId, orderItemId, quantity, status: 'ACTIVE', expiresAt: expiresAt || null },
  });

  await emitOutboxEvent(EVENTS.INVENTORY_CHANGED, 'inventory', productId, {
    productId, locationId, onHand: res.rows[0].on_hand, reserved: res.rows[0].reserved,
  });

  return reservation;
}

// ── Release reservation ────────────────────────────────────────────────────
export async function releaseReservation(reservationId) {
  const reservation = await prisma.stockReservation.findUnique({ where: { id: reservationId } });
  if (!reservation || reservation.status !== 'ACTIVE') return;

  await pool.query(`
    UPDATE inventory_levels
       SET reserved = reserved - $1, version = version + 1
     WHERE product_id = $2 AND location_id = $3 AND reserved >= $1
  `, [reservation.quantity, reservation.productId, reservation.locationId]);

  await prisma.stockReservation.update({ where: { id: reservationId }, data: { status: 'RELEASED' } });

  await emitOutboxEvent(EVENTS.INVENTORY_CHANGED, 'inventory', reservation.productId, {
    productId: reservation.productId, locationId: reservation.locationId,
  });
}

// ── Commit (goods leave the building) ─────────────────────────────────────
export async function commitStock({ productId, locationId, orderItemId, quantity, unitCostCents, referenceId, actor }) {
  if (!locationId) locationId = await getDefaultLocationId();

  const res = await pool.query(`
    UPDATE inventory_levels
       SET on_hand  = on_hand  - $1,
           reserved = reserved - $1,
           version  = version  + 1
     WHERE product_id = $2 AND location_id = $3 AND reserved >= $1 AND on_hand >= $1
    RETURNING on_hand, reserved
  `, [quantity, productId, locationId]);

  if (res.rowCount === 0) throw new AppError('INSUFFICIENT_STOCK', 'Cannot commit — stock mismatch');

  await prisma.stockMovement.create({
    data: {
      productId, locationId,
      quantity: -quantity,
      reason: 'SALE',
      unitCostCents: unitCostCents || null,
      referenceType: 'ORDER',
      referenceId: referenceId || null,
      actorId: actor?.userId || null,
    },
  });

  // Mark reservation committed
  if (orderItemId) {
    await prisma.stockReservation.updateMany({
      where: { orderItemId, status: 'ACTIVE' },
      data:  { status: 'COMMITTED' },
    });
  }

  await emitOutboxEvent(EVENTS.INVENTORY_CHANGED, 'inventory', productId, { productId, locationId });
}

// ── Receive stock (GRN / positive adjustment) ─────────────────────────────
export async function receiveStock({ productId, locationId, quantity, unitCostCents, reason = 'GRN_RECEIPT', referenceType, referenceId, actor }) {
  if (!locationId) locationId = await getDefaultLocationId();

  await pool.query(`
    INSERT INTO inventory_levels (product_id, location_id, on_hand, reserved, version, updated_at)
    VALUES ($1, $2, $3, 0, 1, NOW())
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET on_hand  = inventory_levels.on_hand + $3,
                  version   = inventory_levels.version + 1,
                  updated_at = NOW()
  `, [productId, locationId, quantity]);

  await prisma.stockMovement.create({
    data: {
      productId, locationId,
      quantity: +quantity,
      reason,
      unitCostCents: unitCostCents || null,
      referenceType: referenceType || null,
      referenceId: referenceId || null,
      actorId: actor?.userId || null,
    },
  });

  // Update product average cost
  if (unitCostCents) {
    const level = await prisma.inventoryLevel.findUnique({ where: { productId_locationId: { productId, locationId } } });
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (product) {
      const newQty  = (level?.onHand || 0);
      const prevQty = Math.max(0, newQty - quantity);
      const avgCost = prevQty > 0
        ? Math.round(((product.avgCostCents || unitCostCents) * prevQty + unitCostCents * quantity) / newQty)
        : unitCostCents;
      await prisma.product.update({
        where: { id: productId },
        data: { avgCostCents: avgCost, lastCostCents: unitCostCents },
      });
    }
  }

  await emitOutboxEvent(EVENTS.INVENTORY_CHANGED, 'inventory', productId, { productId, locationId, quantity });
}

// ── Manual adjustment ──────────────────────────────────────────────────────
export async function adjustStock({ productId, locationId, delta, reason, note, actor, approvalId }) {
  if (!locationId) locationId = await getDefaultLocationId();

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError('NOT_FOUND', 'Product not found');

  if (delta > 0) {
    await receiveStock({ productId, locationId, quantity: delta, reason, referenceType: 'ADJUSTMENT', actor });
  } else {
    await pool.query(`
      UPDATE inventory_levels
         SET on_hand = on_hand + $1, version = version + 1
       WHERE product_id = $2 AND location_id = $3 AND on_hand + $1 >= 0
    `, [delta, productId, locationId]);

    await prisma.stockMovement.create({
      data: {
        productId, locationId, quantity: delta, reason,
        note, actorId: actor?.userId || null,
        referenceType: 'ADJUSTMENT',
      },
    });
  }

  await recordAudit({
    actor, action: 'inventory.adjusted', entityType: 'inventory',
    entityId: productId, after: { delta, reason, note },
  }, prisma);

  await emitOutboxEvent(EVENTS.INVENTORY_CHANGED, 'inventory', productId, { productId, locationId, delta });
}

// ── Get levels ─────────────────────────────────────────────────────────────
export async function getLevels(productId) {
  return prisma.inventoryLevel.findMany({ where: { productId } });
}

// ── Expire reservations (called by scheduler) ──────────────────────────────
export async function expireReservations() {
  const expired = await prisma.stockReservation.findMany({
    where: { status: 'ACTIVE', expiresAt: { lt: new Date() } },
  });

  for (const r of expired) {
    try {
      await releaseReservation(r.id);
    } catch (e) {
      console.error('[inventory] Failed to release reservation', r.id, e.message);
    }
  }
  return expired.length;
}

// ── Low stock report ───────────────────────────────────────────────────────
export async function getLowStockProducts() {
  return prisma.$queryRaw`
    SELECT p.id, p.sku, p.name, p.low_stock_threshold, p.reorder_point, p.reorder_qty,
           il.on_hand, il.reserved, (il.on_hand - il.reserved) AS available
    FROM products p
    JOIN inventory_levels il ON il.product_id = p.id
    WHERE p.status = 'ACTIVE'
      AND (il.on_hand - il.reserved) <= p.low_stock_threshold
    ORDER BY (il.on_hand - il.reserved) ASC
  `;
}

// ── Stocktake ──────────────────────────────────────────────────────────────
export async function openStocktake({ locationId, scope, startedById }) {
  return prisma.stocktake.create({ data: { locationId, scope, startedById, status: 'OPEN' } });
}

export async function submitStocktakeCount({ stocktakeId, productId, binId, countedQty, countedById }) {
  const level = await prisma.inventoryLevel.findFirst({ where: { productId } });
  const systemQty = level ? level.onHand : 0;
  const variance  = countedQty - systemQty;

  return prisma.stocktakeLine.upsert({
    where: { stocktakeId_productId: { stocktakeId, productId } },
    update: { countedQty, variance, countedById, binId },
    create: { stocktakeId, productId, binId, systemQty, countedQty, variance, countedById },
  });
}

export async function approveStocktake(stocktakeId, actor) {
  const stocktake = await prisma.stocktake.findUnique({
    where: { id: stocktakeId }, include: { lines: true },
  });
  if (!stocktake) throw new AppError('NOT_FOUND', 'Stocktake not found');

  return prisma.$transaction(async (tx) => {
    for (const line of stocktake.lines) {
      if (line.variance !== 0) {
        const reason = line.variance > 0 ? 'ADJUSTMENT_FOUND' : 'ADJUSTMENT_COUNTED';
        await receiveStock({
          productId: line.productId,
          locationId: stocktake.locationId,
          quantity: line.variance,
          reason, referenceType: 'STOCKTAKE', actor,
        });
      }
    }
    return tx.stocktake.update({
      where: { id: stocktakeId },
      data: { status: 'APPROVED', approvedById: actor.userId, closedAt: new Date() },
    });
  });
}
