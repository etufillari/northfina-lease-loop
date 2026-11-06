-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "relist_price_cents" INTEGER;

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customer_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "quote_date" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "application_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "quote_date" TEXT NOT NULL,
    "signed_on" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contract_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "period_start" TEXT NOT NULL,
    "period_end" TEXT NOT NULL,
    "invoice_date" TEXT NOT NULL,
    "due_date" TEXT NOT NULL,
    "net_cents" INTEGER NOT NULL,
    "vat_rate_basis_points" INTEGER NOT NULL,
    "vat_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Invoice_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetLife" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asset_id" TEXT NOT NULL,
    "life_number" INTEGER NOT NULL,
    "contract_id" TEXT,
    "first_lease_price_cents" INTEGER,
    "started_on" TEXT,
    "ended_on" TEXT,
    "outcome" TEXT,
    "start_condition" TEXT,
    "start_usage_value" INTEGER,
    "end_condition" TEXT,
    "end_usage_value" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "AssetLife_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssetLife_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Application_customer_id_idx" ON "Application"("customer_id");

-- CreateIndex
CREATE INDEX "Application_decision_idx" ON "Application"("decision");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_application_id_key" ON "Contract"("application_id");

-- CreateIndex
CREATE INDEX "Contract_customer_id_idx" ON "Contract"("customer_id");

-- CreateIndex
CREATE INDEX "Contract_asset_id_idx" ON "Contract"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_contract_id_sequence_key" ON "Invoice"("contract_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "AssetLife_contract_id_key" ON "AssetLife"("contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "AssetLife_asset_id_life_number_key" ON "AssetLife"("asset_id", "life_number");
