-- CreateTable
CREATE TABLE "ReturnRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "asset_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expected_return_date" TEXT,
    "received_at" DATETIME,
    "received_by" TEXT,
    "inspected_condition" TEXT,
    "inspected_usage_unit" TEXT,
    "inspected_usage_value" INTEGER,
    "usage_since_last_service" INTEGER,
    "target_condition" TEXT,
    "refurbishment_plan_json" TEXT,
    "refurbishment_total_cost_cents" INTEGER,
    "resulting_condition" TEXT,
    "resulting_usage_unit" TEXT,
    "resulting_usage_value" INTEGER,
    "approved_at" DATETIME,
    "approved_by" TEXT,
    "completed_at" DATETIME,
    "completed_by" TEXT,
    CONSTRAINT "ReturnRequest_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReturnRequest_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ReturnRequest_asset_id_status_idx" ON "ReturnRequest"("asset_id", "status");

-- CreateIndex
CREATE INDEX "ReturnRequest_contract_id_idx" ON "ReturnRequest"("contract_id");

-- CreateIndex
CREATE INDEX "ReturnRequest_customer_id_idx" ON "ReturnRequest"("customer_id");

-- CreateIndex
CREATE INDEX "ReturnRequest_status_idx" ON "ReturnRequest"("status");
