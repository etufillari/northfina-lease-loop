/*
  Warnings:

  - Added the required column `start_on` to the `Application` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customer_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "quote_date" TEXT NOT NULL,
    "start_on" TEXT NOT NULL,
    "price_list_version" INTEGER,
    "base_price_cents" INTEGER NOT NULL,
    "down_payment_cents" INTEGER NOT NULL,
    "financed_cents" INTEGER NOT NULL,
    "term_months" INTEGER NOT NULL,
    "answers_json" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reasons_json" TEXT NOT NULL,
    "reviewed_by" TEXT,
    "reviewed_on" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Application_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Application" ("answers_json", "asset_id", "base_price_cents", "created_at", "customer_id", "decision", "down_payment_cents", "financed_cents", "id", "price_list_version", "quantity", "quote_date", "reasons_json", "reviewed_by", "reviewed_on", "term_months", "updated_at") SELECT "answers_json", "asset_id", "base_price_cents", "created_at", "customer_id", "decision", "down_payment_cents", "financed_cents", "id", "price_list_version", "quantity", "quote_date", "reasons_json", "reviewed_by", "reviewed_on", "term_months", "updated_at" FROM "Application";
DROP TABLE "Application";
ALTER TABLE "new_Application" RENAME TO "Application";
CREATE INDEX "Application_customer_id_idx" ON "Application"("customer_id");
CREATE INDEX "Application_decision_idx" ON "Application"("decision");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
