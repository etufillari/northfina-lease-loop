-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WaitingRequest" (
    "revision" INTEGER NOT NULL DEFAULT 0,
    "update_request_id" TEXT,
    "update_request_hash" TEXT,
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
INSERT INTO "new_WaitingRequest" ("allocated_asset_id", "category", "customer_id", "id", "max_monthly_net_rent_cents", "min_condition", "needed_by", "pending_key", "preferred_term_months", "request_hash", "status", "submitted_on") SELECT "allocated_asset_id", "category", "customer_id", "id", "max_monthly_net_rent_cents", "min_condition", "needed_by", "pending_key", "preferred_term_months", "request_hash", "status", "submitted_on" FROM "WaitingRequest";
DROP TABLE "WaitingRequest";
ALTER TABLE "new_WaitingRequest" RENAME TO "WaitingRequest";
CREATE UNIQUE INDEX "WaitingRequest_update_request_id_key" ON "WaitingRequest"("update_request_id");
CREATE UNIQUE INDEX "WaitingRequest_pending_key_key" ON "WaitingRequest"("pending_key");
CREATE INDEX "WaitingRequest_customer_id_idx" ON "WaitingRequest"("customer_id");
CREATE INDEX "WaitingRequest_status_category_idx" ON "WaitingRequest"("status", "category");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
