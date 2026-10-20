-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QualityGrade" AS ENUM ('ECONOMY', 'STANDARD', 'PREMIUM');

-- CreateEnum
CREATE TYPE "PartOrigin" AS ENUM ('OEM', 'OES', 'AFTERMARKET');

-- CreateEnum
CREATE TYPE "PartCondition" AS ENUM ('NEW', 'USED', 'REMANUFACTURED');

-- CreateEnum
CREATE TYPE "PartNumberType" AS ENUM ('OEM', 'OES', 'AFTERMARKET', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "vehicle_makes" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_makes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_models" (
    "id" UUID NOT NULL,
    "make_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "year_from" INTEGER NOT NULL,
    "year_to" INTEGER NOT NULL,
    "engine" TEXT,
    "variant" TEXT,
    "external_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "brand_id" UUID,
    "category_id" UUID NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "quality_grade" "QualityGrade" NOT NULL DEFAULT 'STANDARD',
    "origin" "PartOrigin" NOT NULL DEFAULT 'AFTERMARKET',
    "condition" "PartCondition" NOT NULL DEFAULT 'NEW',
    "barcode" TEXT,
    "retail_price_cents" INTEGER NOT NULL,
    "sale_price_cents" INTEGER,
    "sale_starts_at" TIMESTAMP(3),
    "sale_ends_at" TIMESTAMP(3),
    "trade_price_cents" INTEGER,
    "last_cost_cents" INTEGER,
    "avg_cost_cents" INTEGER,
    "min_margin_bps" INTEGER,
    "core_charge_cents" INTEGER NOT NULL DEFAULT 0,
    "vat_rate_bps" INTEGER NOT NULL DEFAULT 1600,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 3,
    "reorder_point" INTEGER NOT NULL DEFAULT 0,
    "reorder_qty" INTEGER NOT NULL DEFAULT 0,
    "sourcing_lead_time_mins" INTEGER,
    "is_sourceable" BOOLEAN NOT NULL DEFAULT true,
    "specs" JSONB,
    "warranty_text" TEXT,
    "seo_title" TEXT,
    "seo_description" TEXT,
    "weight_grams" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_numbers" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "type" "PartNumberType" NOT NULL,
    "number" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "manufacturer" TEXT,

    CONSTRAINT "part_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_fitments" (
    "product_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "notes" TEXT,
    "position" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "product_fitments_pkey" PRIMARY KEY ("product_id","vehicle_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_makes_name_key" ON "vehicle_makes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_makes_slug_key" ON "vehicle_makes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_models_make_id_slug_key" ON "vehicle_models"("make_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_external_ref_key" ON "vehicles"("external_ref");

-- CreateIndex
CREATE INDEX "vehicles_model_id_year_from_year_to_idx" ON "vehicles"("model_id", "year_from", "year_to");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "brands_name_key" ON "brands"("name");

-- CreateIndex
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");

-- CreateIndex
CREATE INDEX "products_category_id_status_idx" ON "products"("category_id", "status");

-- CreateIndex
CREATE INDEX "products_brand_id_idx" ON "products"("brand_id");

-- CreateIndex
CREATE INDEX "part_numbers_normalized_idx" ON "part_numbers"("normalized");

-- CreateIndex
CREATE UNIQUE INDEX "part_numbers_product_id_type_normalized_key" ON "part_numbers"("product_id", "type", "normalized");

-- CreateIndex
CREATE INDEX "product_fitments_vehicle_id_idx" ON "product_fitments"("vehicle_id");

-- AddForeignKey
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_make_id_fkey" FOREIGN KEY ("make_id") REFERENCES "vehicle_makes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "vehicle_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_numbers" ADD CONSTRAINT "part_numbers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_fitments" ADD CONSTRAINT "product_fitments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_fitments" ADD CONSTRAINT "product_fitments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Safety rules the database itself enforces (even if app code has a bug)
ALTER TABLE "products" ADD CONSTRAINT "products_prices_nonneg"
  CHECK ("retail_price_cents" >= 0
    AND ("sale_price_cents" IS NULL OR "sale_price_cents" >= 0)
    AND ("trade_price_cents" IS NULL OR "trade_price_cents" >= 0));

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_years_valid"
  CHECK ("year_from" <= "year_to");
