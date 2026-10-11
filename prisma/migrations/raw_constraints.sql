-- ============================================================================
-- MySpares — Raw SQL migration (apply after `prisma migrate deploy`)
-- Run with: psql $DATABASE_URL -f prisma/migrations/raw_constraints.sql
-- or:       prisma db execute --file prisma/migrations/raw_constraints.sql
-- ============================================================================

-- ── Extensions ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ── Sequences for human-readable IDs ─────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS order_number_seq    START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS po_number_seq       START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS grn_number_seq      START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS job_number_seq      START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS pr_number_seq       START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS rma_number_seq      START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS supplier_code_seq   START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS rider_code_seq      START 1 INCREMENT 1;

-- ── Inventory level constraints (BR: stock can never go negative) ─────────
ALTER TABLE inventory_levels
  ADD CONSTRAINT IF NOT EXISTS inv_on_hand_nonneg    CHECK (on_hand  >= 0),
  ADD CONSTRAINT IF NOT EXISTS inv_reserved_nonneg   CHECK (reserved >= 0),
  ADD CONSTRAINT IF NOT EXISTS inv_reserved_le_onhand CHECK (reserved <= on_hand);

-- ── Money sanity constraints ───────────────────────────────────────────────
ALTER TABLE orders
  ADD CONSTRAINT IF NOT EXISTS orders_amounts_nonneg
    CHECK (subtotal_cents >= 0 AND total_cents >= 0 AND amount_paid_cents >= 0);

ALTER TABLE order_items
  ADD CONSTRAINT IF NOT EXISTS order_items_qty_pos CHECK (quantity > 0);

ALTER TABLE purchase_order_items
  ADD CONSTRAINT IF NOT EXISTS poi_qty_pos CHECK (quantity > 0);

-- Journal lines: exactly one side may be non-zero; both non-negative
ALTER TABLE journal_lines
  ADD CONSTRAINT IF NOT EXISTS jl_one_side
    CHECK ((debit_cents = 0) <> (credit_cents = 0) AND debit_cents >= 0 AND credit_cents >= 0);

-- ── Unique partial indexes ─────────────────────────────────────────────────

-- One open shift per register
CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_open_per_register
  ON shifts(register_id) WHERE status = 'OPEN';

-- One active collection job per PO at a time
CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_active_collection
  ON logistics_jobs(purchase_order_id)
  WHERE type = 'COLLECTION' AND status NOT IN ('CANCELLED', 'FAILED', 'CONFIRMED');

-- One active delivery job per order at a time
CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_active_delivery
  ON logistics_jobs(order_id)
  WHERE type = 'DELIVERY' AND status NOT IN ('CANCELLED', 'FAILED', 'CUSTOMER_CONFIRMED');

-- ── Full-text search ───────────────────────────────────────────────────────

-- Add search_vector column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE products ADD COLUMN search_vector tsvector;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS products_search_idx ON products USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS products_name_trgm  ON products USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS part_numbers_trgm   ON part_numbers USING GIN (normalized gin_trgm_ops);

-- Trigger to maintain search_vector on product changes
CREATE OR REPLACE FUNCTION update_product_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.sku, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_search_vector_update ON products;
CREATE TRIGGER products_search_vector_update
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_product_search_vector();

-- Initial population of search_vector for existing rows
UPDATE products SET name = name WHERE search_vector IS NULL;

-- ── Audit log immutability ─────────────────────────────────────────────────
-- Revoke UPDATE and DELETE on audit_logs and append-only tables
-- (Requires the app DB role to exist first — run after migrations, before seeding)

DO $$
BEGIN
  -- Only revoke if the role exists
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'myspares_app') THEN
    REVOKE UPDATE, DELETE ON audit_logs     FROM myspares_app;
    REVOKE UPDATE, DELETE ON stock_movements FROM myspares_app;
    REVOKE UPDATE, DELETE ON journal_lines   FROM myspares_app;
    REVOKE UPDATE, DELETE ON journal_entries FROM myspares_app;
  END IF;
END $$;

-- ── Performance indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS orders_status_created ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_customer_created ON orders(customer_id, created_at DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_state ON payments(state, created_at DESC);
CREATE INDEX IF NOT EXISTS outbox_unpublished ON outbox_events(created_at) WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS stock_res_status_expiry ON stock_reservations(status, expires_at) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS logistics_jobs_status_type ON logistics_jobs(status, type);
CREATE INDEX IF NOT EXISTS po_status_created ON purchase_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS cod_outstanding ON cod_collections(status, collected_at) WHERE status = 'OUTSTANDING';
