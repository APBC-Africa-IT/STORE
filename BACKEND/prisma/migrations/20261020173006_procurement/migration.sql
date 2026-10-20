-- CreateEnum
CREATE TYPE "SupplierType" AS ENUM ('PRIMARY', 'SECONDARY', 'SPECIALIST');

-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BLACKLISTED');

-- CreateEnum
CREATE TYPE "PaymentTerms" AS ENUM ('ON_COLLECTION', 'NET_7', 'NET_14', 'NET_30');

-- CreateEnum
CREATE TYPE "SupplierAvailability" AS ENUM ('IN_STOCK', 'LOW', 'OUT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PurchaseOrderKind" AS ENUM ('REACTIVE', 'RESTOCK');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'CONFIRMED_BY_SUPPLIER', 'PARTIALLY_CONFIRMED', 'REJECTED_BY_SUPPLIER', 'RIDER_ASSIGNED', 'COLLECTED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PoChannel" AS ENUM ('PORTAL', 'EMAIL', 'WHATSAPP', 'PHONE');

-- CreateEnum
CREATE TYPE "GrnStatus" AS ENUM ('PASSED', 'PARTIAL_PASS', 'FAILED');

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SupplierType" NOT NULL,
    "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
    "status_reason" TEXT,
    "contact_name" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "whatsapp" TEXT,
    "address_line" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "categories" TEXT[],
    "payment_terms" "PaymentTerms" NOT NULL DEFAULT 'ON_COLLECTION',
    "typical_lead_time_mins" INTEGER NOT NULL DEFAULT 120,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_catalog_items" (
    "id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "product_id" UUID,
    "part_number" TEXT NOT NULL,
    "part_number_norm" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cost_cents" INTEGER NOT NULL,
    "availability" "SupplierAvailability" NOT NULL DEFAULT 'UNKNOWN',
    "last_confirmed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "kind" "PurchaseOrderKind" NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "sent_via" "PoChannel",
    "sent_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "supplier_ready_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "collection_code_hash" TEXT,
    "total_cost_cents" INTEGER NOT NULL DEFAULT 0,
    "collection_fee_cents" INTEGER NOT NULL DEFAULT 0,
    "other_costs_cents" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "order_item_id" UUID,
    "part_number" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "confirmed_qty" INTEGER,
    "received_qty" INTEGER NOT NULL DEFAULT 0,
    "unit_cost_cents" INTEGER NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grns" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "status" "GrnStatus" NOT NULL,
    "received_by_id" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grn_lines" (
    "id" UUID NOT NULL,
    "grn_id" UUID NOT NULL,
    "purchase_order_item_id" UUID NOT NULL,
    "received_qty" INTEGER NOT NULL,
    "accepted_qty" INTEGER NOT NULL,
    "rejected_qty" INTEGER NOT NULL,
    "landed_unit_cost_cents" INTEGER NOT NULL,
    "checks" JSONB NOT NULL,
    "rejection_reason" TEXT,

    CONSTRAINT "grn_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- CreateIndex
CREATE INDEX "supplier_catalog_items_product_id_idx" ON "supplier_catalog_items"("product_id");

-- CreateIndex
CREATE INDEX "supplier_catalog_items_part_number_norm_idx" ON "supplier_catalog_items"("part_number_norm");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_catalog_items_supplier_id_part_number_norm_key" ON "supplier_catalog_items"("supplier_id", "part_number_norm");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_number_key" ON "purchase_orders"("number");

-- CreateIndex
CREATE INDEX "purchase_orders_status_created_at_idx" ON "purchase_orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "purchase_orders_supplier_id_status_idx" ON "purchase_orders"("supplier_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_items_order_item_id_key" ON "purchase_order_items"("order_item_id");

-- CreateIndex
CREATE INDEX "purchase_order_items_purchase_order_id_idx" ON "purchase_order_items"("purchase_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "grns_number_key" ON "grns"("number");

-- CreateIndex
CREATE INDEX "grns_purchase_order_id_idx" ON "grns"("purchase_order_id");

-- AddForeignKey
ALTER TABLE "supplier_catalog_items" ADD CONSTRAINT "supplier_catalog_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_catalog_items" ADD CONSTRAINT "supplier_catalog_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grns" ADD CONSTRAINT "grns_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "grns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_purchase_order_item_id_fkey" FOREIGN KEY ("purchase_order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE SEQUENCE "supplier_code_seq";
CREATE SEQUENCE "po_number_seq";
CREATE SEQUENCE "grn_number_seq";

ALTER TABLE "purchase_order_items" ADD CONSTRAINT "poi_qty_valid"
  CHECK ("quantity" > 0 AND "received_qty" >= 0
     AND ("confirmed_qty" IS NULL OR "confirmed_qty" BETWEEN 0 AND "quantity")
     AND "unit_cost_cents" >= 0);
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_qty_valid"
  CHECK ("accepted_qty" >= 0 AND "rejected_qty" >= 0 AND "accepted_qty" + "rejected_qty" = "received_qty");
ALTER TABLE "supplier_catalog_items" ADD CONSTRAINT "supplier_cost_nonneg" CHECK ("cost_cents" >= 0);
