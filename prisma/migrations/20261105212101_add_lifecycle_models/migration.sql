-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "first_lease_date" TEXT;
ALTER TABLE "Asset" ADD COLUMN "first_list_price_cents" INTEGER;
ALTER TABLE "Asset" ADD COLUMN "relist_price_cents" INTEGER;

-- CreateTable
CREATE TABLE "PriceList" (
    "version" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "valid_from" TEXT NOT NULL,
    "valid_to" TEXT,
    "note" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "PriceListEntry" (
    "price_list_version" INTEGER NOT NULL,
    "asset_id" TEXT NOT NULL,
    "price_cents" INTEGER NOT NULL,

    PRIMARY KEY ("price_list_version", "asset_id"),
    CONSTRAINT "PriceListEntry_price_list_version_fkey" FOREIGN KEY ("price_list_version") REFERENCES "PriceList" ("version") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PriceListEntry_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CoefficientTable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL,
    "valid_from" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "how_to_use" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "CoefficientBand" (
    "table_id" TEXT NOT NULL,
    "band" TEXT NOT NULL,
    "min_financed_cents" INTEGER NOT NULL,
    "max_financed_cents" INTEGER NOT NULL,
    "annual_interest_bp" INTEGER NOT NULL,

    PRIMARY KEY ("table_id", "band"),
    CONSTRAINT "CoefficientBand_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "CoefficientTable" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CoefficientFactor" (
    "table_id" TEXT NOT NULL,
    "band" TEXT NOT NULL,
    "term_months" INTEGER NOT NULL,
    "factor_ppm" INTEGER NOT NULL,

    PRIMARY KEY ("table_id", "band", "term_months"),
    CONSTRAINT "CoefficientFactor_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "CoefficientTable" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CoefficientFactor_table_id_band_fkey" FOREIGN KEY ("table_id", "band") REFERENCES "CoefficientBand" ("table_id", "band") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BuyoutPercent" (
    "table_id" TEXT NOT NULL,
    "term_months" INTEGER NOT NULL,
    "percent_bp" INTEGER NOT NULL,

    PRIMARY KEY ("table_id", "term_months"),
    CONSTRAINT "BuyoutPercent_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "CoefficientTable" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VatRate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "country" TEXT NOT NULL,
    "rate_bp" INTEGER NOT NULL,
    "valid_from" TEXT NOT NULL,
    "valid_to" TEXT,
    "fictional" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "ResidualCurvePoint" (
    "category" TEXT NOT NULL,
    "age_months" INTEGER NOT NULL,
    "percent_bp" INTEGER NOT NULL,

    PRIMARY KEY ("category", "age_months")
);

-- CreateTable
CREATE TABLE "ConditionMultiplier" (
    "condition" TEXT NOT NULL PRIMARY KEY,
    "multiplier_bp" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "UsageAdjustment" (
    "category" TEXT NOT NULL PRIMARY KEY,
    "unit" TEXT NOT NULL,
    "percent_per_step_bp" INTEGER NOT NULL,
    "step" INTEGER NOT NULL,
    "max_total_percent_bp" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "RefurbishmentUpgrade" (
    "category" TEXT NOT NULL,
    "from_condition" TEXT NOT NULL,
    "to_condition" TEXT NOT NULL,
    "cost_cents" INTEGER NOT NULL,

    PRIMARY KEY ("category", "from_condition", "to_condition")
);

-- CreateTable
CREATE TABLE "RefurbishmentFixedCost" (
    "category" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "cost_cents" INTEGER NOT NULL,
    "when_text" TEXT NOT NULL,
    "resets_usage" BOOLEAN NOT NULL DEFAULT false,
    "mandatory_before_next_lease" BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY ("category", "id")
);

-- CreateTable
CREATE TABLE "SecondLifeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "max_monthly_net_rent_cents" INTEGER NOT NULL,
    "min_condition" TEXT NOT NULL,
    "preferred_term_months" INTEGER NOT NULL,
    "needed_by" TEXT NOT NULL,
    "who" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "position" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "text_en" TEXT NOT NULL,
    "text_fi" TEXT NOT NULL,
    "text_sv" TEXT NOT NULL,
    "text_et" TEXT NOT NULL,
    "why_we_ask_en" TEXT NOT NULL,
    "why_we_ask_fi" TEXT,
    "why_we_ask_sv" TEXT,
    "why_we_ask_et" TEXT,
    "ask_when_json" TEXT NOT NULL,
    "options_json" TEXT,
    "blocks_json" TEXT,
    "validation_format" TEXT,
    "validation_hint" TEXT
);

-- CreateTable
CREATE TABLE "EligibilityRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL
);

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
    "beneficial_owners_json" TEXT
);

-- CreateTable
CREATE TABLE "Co2ManufacturingFactor" (
    "category" TEXT NOT NULL PRIMARY KEY,
    "kg_co2e" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "Co2Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "note" TEXT NOT NULL,
    "refurbishment_share_of_new_bp" INTEGER NOT NULL,
    "e_bike_avoided_car_g_per_km" INTEGER NOT NULL,
    "avoided_by_reuse_formula_hint" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asset_id" TEXT NOT NULL,
    "created_on" TEXT NOT NULL,
    "price_list_version" INTEGER,
    "list_price_cents" INTEGER NOT NULL,
    "down_payment_cents" INTEGER NOT NULL,
    "financed_cents" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "factor_ppm" INTEGER NOT NULL,
    "annual_interest_bp" INTEGER NOT NULL,
    "term_months" INTEGER NOT NULL,
    "monthly_net_rent_cents" INTEGER NOT NULL,
    "buyout_net_cents" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Quote_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Quote_price_list_version_fkey" FOREIGN KEY ("price_list_version") REFERENCES "PriceList" ("version") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quote_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "created_on" TEXT NOT NULL,
    "answers_json" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reasons_json" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Application_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "Quote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Application_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "application_id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "status" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "price_list_version" INTEGER,
    "list_price_cents" INTEGER NOT NULL,
    "down_payment_cents" INTEGER NOT NULL,
    "financed_cents" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "factor_ppm" INTEGER NOT NULL,
    "annual_interest_bp" INTEGER NOT NULL,
    "term_months" INTEGER NOT NULL,
    "monthly_net_rent_cents" INTEGER NOT NULL,
    "buyout_net_cents" INTEGER NOT NULL,
    "total_net_cents" INTEGER NOT NULL,
    "total_gross_cents" INTEGER NOT NULL,
    "signed_on" TEXT NOT NULL,
    "closed_on" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Contract_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "Application" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contract_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "Quote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contract_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contract_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Contract_price_list_version_fkey" FOREIGN KEY ("price_list_version") REFERENCES "PriceList" ("version") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvoiceRow" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contract_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "invoice_date" TEXT NOT NULL,
    "period_start" TEXT NOT NULL,
    "period_end" TEXT NOT NULL,
    "net_cents" INTEGER NOT NULL,
    "vat_rate_bp" INTEGER NOT NULL,
    "vat_cents" INTEGER NOT NULL,
    "gross_cents" INTEGER NOT NULL,
    "cancelled_by_exit" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoiceRow_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "asset_id" TEXT NOT NULL,
    "on_date" TEXT NOT NULL,
    "from_status" TEXT NOT NULL,
    "to_status" TEXT NOT NULL,
    "contract_id" TEXT,
    "condition" TEXT,
    "usage_value" INTEGER,
    "amount_cents" INTEGER,
    "note_key" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetEvent_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssetEvent_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PriceListEntry_asset_id_idx" ON "PriceListEntry"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "VatRate_country_valid_from_key" ON "VatRate"("country", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "Question_position_key" ON "Question"("position");

-- CreateIndex
CREATE UNIQUE INDEX "EligibilityRule_position_key" ON "EligibilityRule"("position");

-- CreateIndex
CREATE INDEX "Quote_asset_id_idx" ON "Quote"("asset_id");

-- CreateIndex
CREATE INDEX "Application_quote_id_idx" ON "Application"("quote_id");

-- CreateIndex
CREATE INDEX "Application_customer_id_idx" ON "Application"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_application_id_key" ON "Contract"("application_id");

-- CreateIndex
CREATE INDEX "Contract_asset_id_idx" ON "Contract"("asset_id");

-- CreateIndex
CREATE INDEX "Contract_customer_id_idx" ON "Contract"("customer_id");

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceRow_contract_id_seq_key" ON "InvoiceRow"("contract_id", "seq");

-- CreateIndex
CREATE INDEX "AssetEvent_asset_id_on_date_idx" ON "AssetEvent"("asset_id", "on_date");

-- CreateIndex
CREATE INDEX "Asset_status_idx" ON "Asset"("status");
