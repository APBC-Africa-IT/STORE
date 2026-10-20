import type { Prisma, PrismaClient } from '@prisma/client';

export type Db = PrismaClient | Prisma.TransactionClient;
type LevelRow = { on_hand: number; reserved: number };

/**
 * Every stock change is ONE atomic SQL statement with the safety condition in the WHERE clause.
 * Two people buying the last unit at the same moment → Postgres lets exactly one UPDATE match.
 * Never "read the quantity in JS, subtract, then save" — that is how shops oversell.
 */
export class InventoryRepository {
  constructor(readonly db: PrismaClient) {}

  /** Hold stock for an order. Returns the new level, or null if not enough is available. */
  async reserve(tx: Db, productId: string, locationId: string, qty: number) {
    const rows = await tx.$queryRaw<LevelRow[]>`
      UPDATE inventory_levels
         SET reserved = reserved + ${qty}, version = version + 1, updated_at = now()
       WHERE product_id = ${productId}::uuid AND location_id = ${locationId}::uuid
         AND on_hand - reserved >= ${qty}
      RETURNING on_hand, reserved`;
    return rows[0] ?? null;
  }

  /** Give held stock back (order cancelled / payment timed out). */
  async release(tx: Db, productId: string, locationId: string, qty: number) {
    const rows = await tx.$queryRaw<LevelRow[]>`
      UPDATE inventory_levels
         SET reserved = reserved - ${qty}, version = version + 1, updated_at = now()
       WHERE product_id = ${productId}::uuid AND location_id = ${locationId}::uuid
         AND reserved >= ${qty}
      RETURNING on_hand, reserved`;
    return rows[0] ?? null;
  }

  /** Held stock physically leaves the hub (dispatched / handed over). */
  async commit(tx: Db, productId: string, locationId: string, qty: number) {
    const rows = await tx.$queryRaw<LevelRow[]>`
      UPDATE inventory_levels
         SET on_hand = on_hand - ${qty}, reserved = reserved - ${qty}, version = version + 1, updated_at = now()
       WHERE product_id = ${productId}::uuid AND location_id = ${locationId}::uuid
         AND reserved >= ${qty} AND on_hand >= ${qty}
      RETURNING on_hand, reserved`;
    return rows[0] ?? null;
  }

  /** Stock comes in (GRN, return, found, opening balance). Creates the row if needed. */
  async receive(tx: Db, productId: string, locationId: string, qty: number) {
    const rows = await tx.$queryRaw<LevelRow[]>`
      INSERT INTO inventory_levels (product_id, location_id, on_hand, reserved, version, updated_at)
      VALUES (${productId}::uuid, ${locationId}::uuid, ${qty}, 0, 1, now())
      ON CONFLICT (product_id, location_id) DO UPDATE
         SET on_hand = inventory_levels.on_hand + EXCLUDED.on_hand,
             version = inventory_levels.version + 1,
             updated_at = now()
      RETURNING on_hand, reserved`;
    return rows[0] as LevelRow;
  }

  /** Stock goes out without a sale (damaged, stolen…). Cannot touch stock already promised to orders. */
  async decrease(tx: Db, productId: string, locationId: string, qty: number) {
    const rows = await tx.$queryRaw<LevelRow[]>`
      UPDATE inventory_levels
         SET on_hand = on_hand - ${qty}, version = version + 1, updated_at = now()
       WHERE product_id = ${productId}::uuid AND location_id = ${locationId}::uuid
         AND on_hand - reserved >= ${qty}
      RETURNING on_hand, reserved`;
    return rows[0] ?? null;
  }

  /** available (on_hand - reserved) per product, summed over locations. */
  async availableByProduct(productIds: string[]) {
    if (productIds.length === 0) return new Map<string, { onHand: number; reserved: number }>();
    const rows = await this.db.$queryRaw<Array<{ product_id: string; on_hand: number; reserved: number }>>`
      SELECT product_id::text, SUM(on_hand)::int AS on_hand, SUM(reserved)::int AS reserved
        FROM inventory_levels
       WHERE product_id = ANY(${productIds}::uuid[])
       GROUP BY product_id`;
    return new Map(rows.map((r) => [r.product_id, { onHand: r.on_hand, reserved: r.reserved }]));
  }

  lowStock(limit = 200) {
    return this.db.$queryRaw<
      Array<{ id: string; sku: string; name: string; low_stock_threshold: number; reorder_point: number; reorder_qty: number; on_hand: number; reserved: number }>
    >`
      SELECT p.id::text, p.sku, p.name, p.low_stock_threshold, p.reorder_point, p.reorder_qty,
             COALESCE(SUM(il.on_hand), 0)::int AS on_hand, COALESCE(SUM(il.reserved), 0)::int AS reserved
        FROM products p
        LEFT JOIN inventory_levels il ON il.product_id = p.id
       WHERE p.status = 'ACTIVE'
       GROUP BY p.id
      HAVING COALESCE(SUM(il.on_hand - il.reserved), 0) <= GREATEST(p.low_stock_threshold, p.reorder_point)
       ORDER BY COALESCE(SUM(il.on_hand - il.reserved), 0) ASC, p.name
       LIMIT ${limit}`;
  }

  async summary() {
    const rows = await this.db.$queryRaw<
      Array<{ total: number; in_stock: number; low_stock: number; out_of_stock: number; stock_value_cents: bigint }>
    >`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE avail > low)::int AS in_stock,
             COUNT(*) FILTER (WHERE avail BETWEEN 1 AND low)::int AS low_stock,
             COUNT(*) FILTER (WHERE avail <= 0)::int AS out_of_stock,
             COALESCE(SUM(on_hand * cost), 0)::bigint AS stock_value_cents
        FROM (
          SELECT p.low_stock_threshold AS low,
                 COALESCE(p.avg_cost_cents, p.last_cost_cents, 0) AS cost,
                 COALESCE(SUM(il.on_hand), 0) AS on_hand,
                 COALESCE(SUM(il.on_hand - il.reserved), 0) AS avail
            FROM products p
            LEFT JOIN inventory_levels il ON il.product_id = p.id
           WHERE p.status = 'ACTIVE'
           GROUP BY p.id
        ) t`;
    const r = rows[0]!;
    return { ...r, stock_value_cents: Number(r.stock_value_cents) };
  }
}
