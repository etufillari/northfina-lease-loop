-- AlterTable
ALTER TABLE "Handover" ADD COLUMN "released_date" TEXT;

-- CreateTable
CREATE TABLE "HoldRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asset_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "requested_date" TEXT NOT NULL,
    "term_months" INTEGER NOT NULL,
    "max_monthly_cents" INTEGER NOT NULL,
    "min_condition" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "held_date" TEXT,
    "withdrawn_date" TEXT
);

-- CreateIndex
CREATE INDEX "HoldRequest_asset_id_idx" ON "HoldRequest"("asset_id");

-- CreateIndex
CREATE INDEX "HoldRequest_customer_id_idx" ON "HoldRequest"("customer_id");
