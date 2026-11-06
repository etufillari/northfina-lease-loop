-- CreateTable
CREATE TABLE "WaitingRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customer_id" TEXT NOT NULL,
    "submitted_on" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "min_condition" TEXT NOT NULL,
    "max_monthly_net_rent_cents" INTEGER NOT NULL,
    "preferred_term_months" INTEGER NOT NULL,
    "needed_by" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "pending_key" TEXT,
    "allocated_asset_id" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "WaitingRequest_pending_key_key" ON "WaitingRequest"("pending_key");

-- CreateIndex
CREATE INDEX "WaitingRequest_customer_id_idx" ON "WaitingRequest"("customer_id");

-- CreateIndex
CREATE INDEX "WaitingRequest_status_category_idx" ON "WaitingRequest"("status", "category");
