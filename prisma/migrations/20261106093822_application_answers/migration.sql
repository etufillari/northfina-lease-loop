-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customer_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "term_months" INTEGER NOT NULL,
    "monthly_net_cents" INTEGER NOT NULL,
    "payment_due_days" INTEGER NOT NULL,
    "price_list_version" INTEGER NOT NULL,
    "offer_expires_on" TEXT NOT NULL,
    "down_payment_cents" INTEGER NOT NULL DEFAULT 0,
    "financed_cents" INTEGER NOT NULL DEFAULT 0,
    "buyout_net_cents" INTEGER NOT NULL DEFAULT 0,
    "circular_offer_id" TEXT,
    "termination_policy" TEXT,
    "status" TEXT NOT NULL,
    "answers_json" TEXT NOT NULL DEFAULT '{}',
    "decision_reason" TEXT NOT NULL,
    "signing_authority" BOOLEAN NOT NULL,
    "submitted_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signed_at" DATETIME
);
INSERT INTO "new_Application" ("asset_id", "buyout_net_cents", "circular_offer_id", "customer_id", "decision_reason", "down_payment_cents", "financed_cents", "id", "monthly_net_cents", "offer_expires_on", "payment_due_days", "price_list_version", "signed_at", "signing_authority", "start_date", "status", "submitted_at", "term_months", "termination_policy") SELECT "asset_id", "buyout_net_cents", "circular_offer_id", "customer_id", "decision_reason", "down_payment_cents", "financed_cents", "id", "monthly_net_cents", "offer_expires_on", "payment_due_days", "price_list_version", "signed_at", "signing_authority", "start_date", "status", "submitted_at", "term_months", "termination_policy" FROM "Application";
DROP TABLE "Application";
ALTER TABLE "new_Application" RENAME TO "Application";
CREATE INDEX "Application_customer_id_idx" ON "Application"("customer_id");
CREATE INDEX "Application_asset_id_idx" ON "Application"("asset_id");
CREATE INDEX "Application_status_idx" ON "Application"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
