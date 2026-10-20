-- CreateEnum
CREATE TYPE "StockMovementReason" AS ENUM ('OPENING_BALANCE', 'SALE', 'GRN_RECEIPT', 'CUSTOMER_RETURN', 'DELIVERY_RETURNED', 'RETURN_TO_SUPPLIER', 'ADJUSTMENT_DAMAGED', 'ADJUSTMENT_COUNTED', 'ADJUSTMENT_STOLEN', 'ADJUSTMENT_PROMO_WRITE_OFF', 'ADJUSTMENT_FOUND', 'TRANSFER_IN', 'TRANSFER_OUT');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'COMMITTED', 'RELEASED');

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bins" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_levels" (
    "product_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "bin_id" UUID,
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_levels_pkey" PRIMARY KEY ("product_id","location_id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" "StockMovementReason" NOT NULL,
    "unit_cost_cents" INTEGER,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "note" TEXT,
    "actor_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_reservations" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "order_item_id" UUID,
    "quantity" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "locations_code_key" ON "locations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bins_location_id_code_key" ON "bins"("location_id", "code");

-- CreateIndex
CREATE INDEX "stock_movements_product_id_created_at_idx" ON "stock_movements"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_reference_type_reference_id_idx" ON "stock_movements"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "stock_reservations_status_expires_at_idx" ON "stock_reservations"("status", "expires_at");

-- CreateIndex
CREATE INDEX "stock_reservations_order_item_id_idx" ON "stock_reservations"("order_item_id");

-- AddForeignKey
ALTER TABLE "bins" ADD CONSTRAINT "bins_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_bin_id_fkey" FOREIGN KEY ("bin_id") REFERENCES "bins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Stock can NEVER go negative, and we can never promise more than we physically have.
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inv_on_hand_nonneg" CHECK ("on_hand" >= 0);
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inv_reserved_nonneg" CHECK ("reserved" >= 0);
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inv_reserved_le_on_hand" CHECK ("reserved" <= "on_hand");
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_qty_nonzero" CHECK ("quantity" <> 0);
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_qty_pos" CHECK ("quantity" > 0);

-- Only one default location
CREATE UNIQUE INDEX "locations_one_default" ON "locations" ("is_default") WHERE "is_default";
