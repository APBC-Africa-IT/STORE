-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('MPESA_STK', 'CARD_STRIPE', 'CASH', 'CARD_POS_TERMINAL', 'BANK_TRANSFER', 'COD');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('FULL', 'DEPOSIT', 'BALANCE');

-- CreateEnum
CREATE TYPE "PaymentState" AS ENUM ('INITIATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "state" "PaymentState" NOT NULL DEFAULT 'INITIATED',
    "amount_cents" INTEGER NOT NULL,
    "phone" TEXT,
    "provider_ref" TEXT,
    "provider_request_id" TEXT,
    "merchant_request_id" TEXT,
    "result_code" TEXT,
    "failure_reason" TEXT,
    "idempotency_key" TEXT,
    "check_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_checked_at" TIMESTAMP(3),
    "succeeded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "processed_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_ref_key" ON "payments"("provider_ref");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_request_id_key" ON "payments"("provider_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_state_created_at_idx" ON "payments"("state", "created_at");

-- CreateIndex
CREATE INDEX "webhook_events_processed_at_created_at_idx" ON "webhook_events"("processed_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_external_id_key" ON "webhook_events"("provider", "external_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_pos" CHECK ("amount_cents" > 0);

-- Only ONE open M-Pesa prompt per order at a time (no double charging)
CREATE UNIQUE INDEX "payments_one_open_per_order" ON "payments" ("order_id") WHERE "state" IN ('INITIATED', 'PENDING');
