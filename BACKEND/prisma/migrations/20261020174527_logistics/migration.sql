-- CreateEnum
CREATE TYPE "RiderStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('COLLECTION', 'DELIVERY');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('CREATED', 'ASSIGNED', 'EN_ROUTE', 'COLLECTED', 'AT_HUB', 'CONFIRMED', 'DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobUrgency" AS ENUM ('NORMAL', 'URGENT');

-- CreateEnum
CREATE TYPE "CodStatus" AS ENUM ('OUTSTANDING', 'RECONCILED', 'DISCREPANCY');

-- CreateEnum
CREATE TYPE "EarningType" AS ENUM ('TRIP', 'BONUS', 'DEDUCTION');

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "collection_code_attempts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "riders" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "national_id_enc" TEXT NOT NULL,
    "national_id_last4" TEXT NOT NULL,
    "bike_plate" TEXT NOT NULL,
    "mpesa_number" TEXT NOT NULL,
    "status" "RiderStatus" NOT NULL DEFAULT 'ACTIVE',
    "status_reason" TEXT,
    "is_preferred" BOOLEAN NOT NULL DEFAULT false,
    "is_on_duty" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "riders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_jobs" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'CREATED',
    "urgency" "JobUrgency" NOT NULL DEFAULT 'NORMAL',
    "rider_id" UUID,
    "purchase_order_id" UUID,
    "order_id" UUID,
    "origin" JSONB NOT NULL,
    "destination" JSONB NOT NULL,
    "instructions" TEXT,
    "cod_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "delivery_otp_hash" TEXT,
    "otp_attempts" INTEGER NOT NULL DEFAULT 0,
    "proof" JSONB,
    "rider_fee_cents" INTEGER NOT NULL,
    "fail_reason" TEXT,
    "cancel_reason" TEXT,
    "assigned_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logistics_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_job_events" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "from_status" "JobStatus",
    "to_status" "JobStatus" NOT NULL,
    "actor_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logistics_job_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cod_collections" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "rider_id" UUID NOT NULL,
    "expected_cents" INTEGER NOT NULL,
    "handed_over_cents" INTEGER,
    "status" "CodStatus" NOT NULL DEFAULT 'OUTSTANDING',
    "collected_at" TIMESTAMP(3) NOT NULL,
    "reconciled_at" TIMESTAMP(3),
    "reconciled_by_id" UUID,
    "alerted_at" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "cod_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_earnings" (
    "id" UUID NOT NULL,
    "rider_id" UUID NOT NULL,
    "job_id" UUID,
    "type" "EarningType" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "riders_code_key" ON "riders"("code");

-- CreateIndex
CREATE UNIQUE INDEX "riders_phone_key" ON "riders"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_jobs_number_key" ON "logistics_jobs"("number");

-- CreateIndex
CREATE INDEX "logistics_jobs_status_type_idx" ON "logistics_jobs"("status", "type");

-- CreateIndex
CREATE INDEX "logistics_jobs_rider_id_status_idx" ON "logistics_jobs"("rider_id", "status");

-- CreateIndex
CREATE INDEX "logistics_jobs_purchase_order_id_idx" ON "logistics_jobs"("purchase_order_id");

-- CreateIndex
CREATE INDEX "logistics_jobs_order_id_idx" ON "logistics_jobs"("order_id");

-- CreateIndex
CREATE INDEX "logistics_job_events_job_id_created_at_idx" ON "logistics_job_events"("job_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "cod_collections_job_id_key" ON "cod_collections"("job_id");

-- CreateIndex
CREATE INDEX "cod_collections_status_collected_at_idx" ON "cod_collections"("status", "collected_at");

-- CreateIndex
CREATE INDEX "cod_collections_rider_id_status_idx" ON "cod_collections"("rider_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rider_earnings_job_id_key" ON "rider_earnings"("job_id");

-- CreateIndex
CREATE INDEX "rider_earnings_rider_id_created_at_idx" ON "rider_earnings"("rider_id", "created_at");

-- AddForeignKey
ALTER TABLE "logistics_jobs" ADD CONSTRAINT "logistics_jobs_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_jobs" ADD CONSTRAINT "logistics_jobs_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_jobs" ADD CONSTRAINT "logistics_jobs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_job_events" ADD CONSTRAINT "logistics_job_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "logistics_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cod_collections" ADD CONSTRAINT "cod_collections_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "logistics_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cod_collections" ADD CONSTRAINT "cod_collections_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_earnings" ADD CONSTRAINT "rider_earnings_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_earnings" ADD CONSTRAINT "rider_earnings_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "logistics_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE SEQUENCE "rider_code_seq";
CREATE SEQUENCE "job_number_seq";

-- One active trip per PO / per order. Two dispatchers can't create duplicates.
CREATE UNIQUE INDEX "jobs_one_active_collection" ON "logistics_jobs" ("purchase_order_id")
  WHERE "type" = 'COLLECTION' AND "status" IN ('CREATED', 'ASSIGNED', 'EN_ROUTE', 'COLLECTED');
CREATE UNIQUE INDEX "jobs_one_active_delivery" ON "logistics_jobs" ("order_id")
  WHERE "type" = 'DELIVERY' AND "status" IN ('CREATED', 'ASSIGNED', 'EN_ROUTE', 'FAILED');

ALTER TABLE "logistics_jobs" ADD CONSTRAINT "jobs_link_valid" CHECK (
  ("type" = 'COLLECTION' AND "purchase_order_id" IS NOT NULL) OR ("type" = 'DELIVERY' AND "order_id" IS NOT NULL));
ALTER TABLE "logistics_jobs" ADD CONSTRAINT "jobs_money_nonneg" CHECK ("cod_amount_cents" >= 0 AND "rider_fee_cents" >= 0);
ALTER TABLE "rider_earnings" ADD CONSTRAINT "earning_sign_valid" CHECK (
  ("type" = 'DEDUCTION' AND "amount_cents" < 0) OR ("type" <> 'DEDUCTION' AND "amount_cents" > 0));
ALTER TABLE "cod_collections" ADD CONSTRAINT "cod_amounts_valid" CHECK (
  "expected_cents" > 0 AND ("handed_over_cents" IS NULL OR "handed_over_cents" BETWEEN 0 AND "expected_cents"));
