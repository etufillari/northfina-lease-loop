-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birth_date" TEXT,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "employment" TEXT,
    "monthly_net_income_cents" INTEGER,
    "business_id" TEXT,
    "vat_registered" BOOLEAN,
    "annual_revenue_cents" INTEGER,
    "applicant_can_sign" BOOLEAN,
    "beneficial_owners_json" TEXT,
    "is_pep" BOOLEAN NOT NULL,
    "story" TEXT NOT NULL,
    "preferred_locale" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asset_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "quote_date" TEXT NOT NULL,
    "valid_until" TEXT NOT NULL,
    "price_list_version" INTEGER NOT NULL,
    "list_price_cents" INTEGER NOT NULL,
    "down_payment_cents" INTEGER NOT NULL,
    "financed_cents" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "factor_millionths" INTEGER NOT NULL,
    "term_months" INTEGER NOT NULL,
    "monthly_net_cents" INTEGER NOT NULL,
    "buyout_cents" INTEGER NOT NULL,
    "vat_rate_bp_at_quote" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Quote_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customer_id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "answers_json" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reasons_json" TEXT NOT NULL,
    "decided_on" TEXT NOT NULL,
    "reviewed_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Application_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Application_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "Quote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "previous_contract_id" TEXT,
    "signed_on" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "term_months" INTEGER NOT NULL,
    "list_price_cents" INTEGER NOT NULL,
    "down_payment_cents" INTEGER NOT NULL,
    "financed_cents" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "factor_millionths" INTEGER NOT NULL,
    "monthly_net_cents" INTEGER NOT NULL,
    "buyout_cents" INTEGER NOT NULL,
    "vat_rate_bp_at_signing" INTEGER NOT NULL,
    "price_list_version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "ended_on" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Contract_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "Application" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contract_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contract_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contract_previous_contract_id_fkey" FOREIGN KEY ("previous_contract_id") REFERENCES "Contract" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contract_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "period_start" TEXT,
    "period_end" TEXT,
    "issue_date" TEXT NOT NULL,
    "due_date" TEXT NOT NULL,
    "net_cents" INTEGER NOT NULL,
    "vat_rate_bp" INTEGER NOT NULL,
    "vat_cents" INTEGER NOT NULL,
    "gross_cents" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "paid_on" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Invoice_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "asset_id" TEXT NOT NULL,
    "contract_id" TEXT,
    "kind" TEXT NOT NULL,
    "on_date" TEXT NOT NULL,
    "details_json" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetEvent_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssetEvent_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReturnAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asset_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "assessed_on" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "usage_value" INTEGER NOT NULL,
    "refurbishment_json" TEXT NOT NULL,
    "refurbish" BOOLEAN NOT NULL,
    "new_condition" TEXT NOT NULL,
    "market_value_cents" INTEGER NOT NULL,
    "second_life_financed_cents" INTEGER NOT NULL,
    "matched_demand_id" TEXT,
    "match_reasons_json" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReturnAssessment_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReturnAssessment_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Quote_asset_id_idx" ON "Quote"("asset_id");

-- CreateIndex
CREATE INDEX "Application_customer_id_idx" ON "Application"("customer_id");

-- CreateIndex
CREATE INDEX "Application_quote_id_idx" ON "Application"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_number_key" ON "Contract"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_application_id_key" ON "Contract"("application_id");

-- CreateIndex
CREATE INDEX "Contract_customer_id_idx" ON "Contract"("customer_id");

-- CreateIndex
CREATE INDEX "Contract_asset_id_idx" ON "Contract"("asset_id");

-- CreateIndex
CREATE INDEX "Contract_previous_contract_id_idx" ON "Contract"("previous_contract_id");

-- CreateIndex
CREATE INDEX "Invoice_contract_id_due_date_idx" ON "Invoice"("contract_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_contract_id_sequence_key" ON "Invoice"("contract_id", "sequence");

-- CreateIndex
CREATE INDEX "AssetEvent_asset_id_id_idx" ON "AssetEvent"("asset_id", "id");

-- CreateIndex
CREATE INDEX "AssetEvent_contract_id_idx" ON "AssetEvent"("contract_id");

-- CreateIndex
CREATE INDEX "ReturnAssessment_asset_id_idx" ON "ReturnAssessment"("asset_id");

-- CreateIndex
CREATE INDEX "ReturnAssessment_contract_id_idx" ON "ReturnAssessment"("contract_id");
