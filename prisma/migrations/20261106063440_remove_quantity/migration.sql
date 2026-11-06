/*
  Warnings:

  - You are about to drop the column `quantity` on the `Application` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `Contract` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customer_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
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
INSERT INTO "new_Application" ("answers_json", "asset_id", "base_price_cents", "created_at", "customer_id", "decision", "down_payment_cents", "financed_cents", "id", "price_list_version", "quote_date", "reasons_json", "reviewed_by", "reviewed_on", "start_on", "term_months", "updated_at") SELECT "answers_json", "asset_id", "base_price_cents", "created_at", "customer_id", "decision", "down_payment_cents", "financed_cents", "id", "price_list_version", "quote_date", "reasons_json", "reviewed_by", "reviewed_on", "start_on", "term_months", "updated_at" FROM "Application";
DROP TABLE "Application";
ALTER TABLE "new_Application" RENAME TO "Application";
CREATE INDEX "Application_customer_id_idx" ON "Application"("customer_id");
CREATE INDEX "Application_decision_idx" ON "Application"("decision");
CREATE TABLE "new_Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "application_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "quote_date" TEXT NOT NULL,
    "signed_on" TEXT NOT NULL,
    "signed_by" TEXT,
    "start_on" TEXT NOT NULL,
    "planned_end_on" TEXT NOT NULL,
    "actual_end_on" TEXT,
    "status" TEXT NOT NULL,
    "price_list_version" INTEGER,
    "base_price_cents" INTEGER NOT NULL,
    "down_payment_cents" INTEGER NOT NULL,
    "financed_cents" INTEGER NOT NULL,
    "term_months" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "factor_micros" INTEGER NOT NULL,
    "annual_interest_basis_points" INTEGER NOT NULL,
    "monthly_net_rent_cents" INTEGER NOT NULL,
    "buyout_cents" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Contract_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "Application" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contract_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Contract" ("actual_end_on", "annual_interest_basis_points", "application_id", "asset_id", "band", "base_price_cents", "buyout_cents", "created_at", "customer_id", "down_payment_cents", "factor_micros", "financed_cents", "id", "monthly_net_rent_cents", "planned_end_on", "price_list_version", "quote_date", "signed_by", "signed_on", "start_on", "status", "term_months", "updated_at") SELECT "actual_end_on", "annual_interest_basis_points", "application_id", "asset_id", "band", "base_price_cents", "buyout_cents", "created_at", "customer_id", "down_payment_cents", "factor_micros", "financed_cents", "id", "monthly_net_rent_cents", "planned_end_on", "price_list_version", "quote_date", "signed_by", "signed_on", "start_on", "status", "term_months", "updated_at" FROM "Contract";
DROP TABLE "Contract";
ALTER TABLE "new_Contract" RENAME TO "Contract";
CREATE UNIQUE INDEX "Contract_application_id_key" ON "Contract"("application_id");
CREATE INDEX "Contract_customer_id_idx" ON "Contract"("customer_id");
CREATE INDEX "Contract_asset_id_idx" ON "Contract"("asset_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
