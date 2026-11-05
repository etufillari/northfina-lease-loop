-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "is_pep" BOOLEAN NOT NULL DEFAULT false,
    "story" TEXT,
    "birth_date" TEXT,
    "employment" TEXT,
    "monthly_net_income_cents" INTEGER,
    "business_id" TEXT,
    "vat_registered" BOOLEAN,
    "annual_revenue_cents" INTEGER,
    "applicant_can_sign" BOOLEAN,
    "beneficial_owners_json" TEXT,
    "saved_defaults_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asset_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "quote_date" TEXT NOT NULL,
    "price_list_version" INTEGER NOT NULL,
    "unit_list_price_cents" INTEGER NOT NULL,
    "list_price_cents" INTEGER NOT NULL,
    "down_payment_cents" INTEGER NOT NULL,
    "term_months" INTEGER NOT NULL,
    "financed_cents" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "factor_ppm" INTEGER NOT NULL,
    "monthly_net_rent_cents" INTEGER NOT NULL,
    "net_total_cents" INTEGER NOT NULL,
    "last_month_net_rent_cents" INTEGER NOT NULL,
    "buyout_net_cents" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quote_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "answers_json" TEXT NOT NULL DEFAULT '{}',
    "decision_reasons_json" TEXT,
    "signatory_email" TEXT,
    "hold_until" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Application_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "Quote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "application_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "quote_date" TEXT NOT NULL,
    "price_list_version" INTEGER NOT NULL,
    "signed_date" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "term_months" INTEGER NOT NULL,
    "financed_cents" INTEGER NOT NULL,
    "monthly_net_rent_cents" INTEGER NOT NULL,
    "net_total_cents" INTEGER NOT NULL,
    "last_month_net_rent_cents" INTEGER NOT NULL,
    "buyout_net_cents" INTEGER NOT NULL,
    "usage_purpose" TEXT,
    "purchase_at_end" BOOLEAN NOT NULL DEFAULT false,
    "transfer_token" TEXT,
    "previous_contract_id" TEXT,
    "ended_on" TEXT,
    "end_reason" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Contract_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "Application" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContractAsset" (
    "contract_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,

    PRIMARY KEY ("contract_id", "asset_id"),
    CONSTRAINT "ContractAsset_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contract_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'lease',
    "due_date" TEXT NOT NULL,
    "period_start" TEXT,
    "period_end" TEXT,
    "net_cents" INTEGER NOT NULL,
    "vat_rate_bp" INTEGER NOT NULL,
    "vat_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asset_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "kind" TEXT NOT NULL,
    "until" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "max_monthly_net_rent_cents" INTEGER NOT NULL,
    "min_condition" TEXT NOT NULL,
    "preferred_term_months" INTEGER NOT NULL,
    "needed_by" TEXT NOT NULL,
    "joined_on" TEXT NOT NULL,
    "who" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "offered_asset_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AssetEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "asset_id" TEXT NOT NULL,
    "contract_id" TEXT,
    "type" TEXT NOT NULL,
    "on_date" TEXT NOT NULL,
    "details_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Application_customer_id_idx" ON "Application"("customer_id");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_application_id_key" ON "Contract"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_transfer_token_key" ON "Contract"("transfer_token");

-- CreateIndex
CREATE INDEX "Contract_customer_id_idx" ON "Contract"("customer_id");

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- CreateIndex
CREATE INDEX "ContractAsset_asset_id_idx" ON "ContractAsset"("asset_id");

-- CreateIndex
CREATE INDEX "Invoice_contract_id_idx" ON "Invoice"("contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_contract_id_number_key" ON "Invoice"("contract_id", "number");

-- CreateIndex
CREATE INDEX "Reservation_asset_id_active_idx" ON "Reservation"("asset_id", "active");

-- CreateIndex
CREATE INDEX "AssetEvent_asset_id_idx" ON "AssetEvent"("asset_id");
