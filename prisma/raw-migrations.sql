-- ─────────────────────────────────────────────────────────────
-- MySpares raw SQL migration
-- Run ONCE after prisma db push: node prisma/run-raw-migration.mjs
-- ─────────────────────────────────────────────────────────────

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Inventory invariants ─────────────────────────────────────
ALTER TABLE inventory_levels
  DROP CONSTRAINT IF EXISTS inv_on_hand_nonneg,
  DROP CONSTRAINT IF EXISTS inv_reserved_nonneg,
  DROP CONSTRAINT IF EXISTS inv_reserved_le_on_hand;

ALTER TABLE inventory_levels
  ADD CONSTRAINT inv_on_hand_nonneg       CHECK (on_hand >= 0),
  ADD CONSTRAINT inv_reserved_nonneg      CHECK (reserved >= 0),
  ADD CONSTRAINT inv_reserved_le_on_hand  CHECK (reserved <= on_hand);

-- ─── Money sanity ────────────────────────────────────────────
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_amounts_nonneg;
ALTER TABLE orders
  ADD CONSTRAINT orders_amounts_nonneg
    CHECK (subtotal_cents >= 0 AND total_cents >= 0 AND amount_paid_cents >= 0);

ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_qty_pos;
ALTER TABLE order_items
  ADD CONSTRAINT order_items_qty_pos CHECK (quantity > 0);

ALTER TABLE purchase_order_items
  DROP CONSTRAINT IF EXISTS poi_qty_pos;
ALTER TABLE purchase_order_items
  ADD CONSTRAINT poi_qty_pos CHECK (quantity > 0);

ALTER TABLE journal_lines
  DROP CONSTRAINT IF EXISTS jl_one_side;
ALTER TABLE journal_lines
  ADD CONSTRAINT jl_one_side
    CHECK (
      (debit_cents = 0) <> (credit_cents = 0)
      AND debit_cents >= 0
      AND credit_cents >= 0
    );

-- ─── POS: one open shift per register ─────────────────────────
DROP INDEX IF EXISTS shifts_one_open_per_register;
CREATE UNIQUE INDEX shifts_one_open_per_register
  ON shifts(register_id) WHERE status = 'OPEN';

-- ─── Logistics: one active job per PO / order at a time ───────
DROP INDEX IF EXISTS jobs_one_active_collection;
DROP INDEX IF EXISTS jobs_one_active_delivery;

CREATE UNIQUE INDEX jobs_one_active_collection
  ON logistics_jobs(purchase_order_id)
  WHERE type = 'COLLECTION'
    AND status NOT IN ('CANCELLED','FAILED','CONFIRMED');

CREATE UNIQUE INDEX jobs_one_active_delivery
  ON logistics_jobs(order_id)
  WHERE type = 'DELIVERY'
    AND status NOT IN ('CANCELLED','FAILED','CUSTOMER_CONFIRMED');

-- ─── Human-readable number sequences ──────────────────────────
CREATE SEQUENCE IF NOT EXISTS order_number_seq   START 1;
CREATE SEQUENCE IF NOT EXISTS po_number_seq      START 1;
CREATE SEQUENCE IF NOT EXISTS grn_number_seq     START 1;
CREATE SEQUENCE IF NOT EXISTS job_number_seq     START 1;
CREATE SEQUENCE IF NOT EXISTS pr_number_seq      START 1;
CREATE SEQUENCE IF NOT EXISTS rma_number_seq     START 1;
CREATE SEQUENCE IF NOT EXISTS supplier_code_seq  START 1;
CREATE SEQUENCE IF NOT EXISTS rider_code_seq     START 1;

-- ─── Full-text search on products ─────────────────────────────
ALTER TABLE products
  DROP COLUMN IF EXISTS search_vector;
ALTER TABLE products
  ADD COLUMN search_vector tsvector;

DROP INDEX IF EXISTS products_search_idx;
DROP INDEX IF EXISTS products_name_trgm;
DROP INDEX IF EXISTS part_numbers_trgm;

CREATE INDEX products_search_idx ON products USING GIN (search_vector);
CREATE INDEX products_name_trgm  ON products USING GIN (name gin_trgm_ops);
CREATE INDEX part_numbers_trgm   ON part_numbers USING GIN (normalized gin_trgm_ops);

-- Trigger to auto-update search_vector on products
CREATE OR REPLACE FUNCTION products_search_vector_update()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.sku, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_search_vector_trigger ON products;
CREATE TRIGGER products_search_vector_trigger
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION products_search_vector_update();

-- Back-fill existing products
UPDATE products SET name = name;

-- ─── Audit log immutability ───────────────────────────────────
-- (grant/revoke requires superuser; skipped here, handled in DB role setup)
-- REVOKE UPDATE, DELETE ON audit_logs, stock_movements, journal_lines, journal_entries FROM myspares_app;

-- ─── Supplier / rider code helpers ───────────────────────────
CREATE OR REPLACE FUNCTION next_supplier_code() RETURNS text AS $$
  SELECT 'SUP-' || lpad(nextval('supplier_code_seq')::text, 4, '0');
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION next_rider_code() RETURNS text AS $$
  SELECT 'RDR-' || lpad(nextval('rider_code_seq')::text, 4, '0');
$$ LANGUAGE sql;
