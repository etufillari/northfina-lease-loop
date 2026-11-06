-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "is_pep" BOOLEAN NOT NULL,
    "story" TEXT NOT NULL,
    "birth_date" TEXT,
    "employment" TEXT,
    "monthly_net_income_cents" INTEGER,
    "business_id" TEXT,
    "vat_registered" BOOLEAN,
    "annual_revenue_cents" INTEGER,
    "applicant_can_sign" BOOLEAN,
    "beneficial_owners_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customer_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requested_term_months" INTEGER NOT NULL,
    "down_payment_cents" INTEGER NOT NULL,
    "start_date" TEXT NOT NULL,
    "answers_json" TEXT NOT NULL,
    "decision_reasons_json" TEXT,
    "decision_at" DATETIME,
    "quote_date" TEXT,
    "price_list_version" INTEGER,
    "list_price_cents" INTEGER,
    "financed_amount_cents" INTEGER,
    "coefficient_band" TEXT,
    "coefficient_factor_ppm" INTEGER,
    "monthly_net_rent_cents" INTEGER,
    "buyout_cents" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Application_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Application_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "application_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "signed_on" TEXT,
    "starts_on" TEXT NOT NULL,
    "ends_on" TEXT NOT NULL,
    "term_months" INTEGER NOT NULL,
    "down_payment_cents" INTEGER NOT NULL,
    "list_price_cents" INTEGER NOT NULL,
    "financed_amount_cents" INTEGER NOT NULL,
    "price_list_version" INTEGER NOT NULL,
    "coefficient_band" TEXT NOT NULL,
    "coefficient_factor_ppm" INTEGER NOT NULL,
    "monthly_net_rent_cents" INTEGER NOT NULL,
    "buyout_cents" INTEGER NOT NULL,
    "pricing_snapshot_json" TEXT,
    "end_of_term_action" TEXT,
    "completed_on" TEXT,
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
    "status" TEXT NOT NULL DEFAULT 'issued',
    "period_start" TEXT NOT NULL,
    "period_end" TEXT NOT NULL,
    "due_on" TEXT NOT NULL,
    "net_rent_cents" INTEGER NOT NULL,
    "vat_rate_basis_points" INTEGER NOT NULL,
    "vat_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "issued_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" DATETIME,
    CONSTRAINT "Invoice_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "asset_id" TEXT NOT NULL,
    "contract_id" TEXT,
    "event_type" TEXT NOT NULL,
    "occurred_on" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT,
    "condition" TEXT,
    "usage_unit" TEXT,
    "usage_value" INTEGER,
    "actor" TEXT NOT NULL,
    "details_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetHistory_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssetHistory_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_business_id_key" ON "Customer"("business_id");

-- CreateIndex
CREATE INDEX "Customer_country_idx" ON "Customer"("country");

-- CreateIndex
CREATE INDEX "Application_customer_id_idx" ON "Application"("customer_id");

-- CreateIndex
CREATE INDEX "Application_asset_id_idx" ON "Application"("asset_id");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_application_id_key" ON "Contract"("application_id");

-- CreateIndex
CREATE INDEX "Contract_asset_id_idx" ON "Contract"("asset_id");

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- CreateIndex
CREATE INDEX "Invoice_due_on_status_idx" ON "Invoice"("due_on", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_contract_id_sequence_key" ON "Invoice"("contract_id", "sequence");

-- CreateIndex
CREATE INDEX "AssetHistory_asset_id_occurred_on_idx" ON "AssetHistory"("asset_id", "occurred_on");

-- CreateIndex
CREATE INDEX "AssetHistory_contract_id_idx" ON "AssetHistory"("contract_id");
