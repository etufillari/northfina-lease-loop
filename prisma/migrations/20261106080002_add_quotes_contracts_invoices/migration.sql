-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asset_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "quoted_on" TEXT NOT NULL,
    "price_list_version" INTEGER,
    "list_price_cents" INTEGER NOT NULL,
    "down_payment_cents" INTEGER NOT NULL,
    "term_months" INTEGER NOT NULL,
    "financed_cents" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "monthly_factor" REAL NOT NULL,
    "annual_interest_percent" REAL NOT NULL,
    "monthly_net_rent_cents" INTEGER NOT NULL,
    "buyout_percent" REAL NOT NULL,
    "buyout_net_cents" INTEGER NOT NULL,
    "contract_net_total_cents" INTEGER NOT NULL,
    CONSTRAINT "Quote_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quote_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "signed_on" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "price_list_version" INTEGER,
    "list_price_cents" INTEGER NOT NULL,
    "down_payment_cents" INTEGER NOT NULL,
    "term_months" INTEGER NOT NULL,
    "financed_cents" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "monthly_factor" REAL NOT NULL,
    "annual_interest_percent" REAL NOT NULL,
    "monthly_net_rent_cents" INTEGER NOT NULL,
    "buyout_percent" REAL NOT NULL,
    "buyout_net_cents" INTEGER NOT NULL,
    "contract_net_total_cents" INTEGER NOT NULL,
    "price_lock_json" TEXT NOT NULL,
    CONSTRAINT "Contract_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "Quote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contract_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contract_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "invoice_date" TEXT NOT NULL,
    "due_date" TEXT NOT NULL,
    "period_start" TEXT,
    "period_end" TEXT,
    "net_cents" INTEGER NOT NULL,
    "vat_rate_percent" REAL NOT NULL,
    "vat_cents" INTEGER NOT NULL,
    "gross_cents" INTEGER NOT NULL,
    CONSTRAINT "Invoice_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Quote_asset_id_idx" ON "Quote"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_quote_id_key" ON "Contract"("quote_id");

-- CreateIndex
CREATE INDEX "Contract_asset_id_idx" ON "Contract"("asset_id");

-- CreateIndex
CREATE INDEX "Contract_customer_id_idx" ON "Contract"("customer_id");

-- CreateIndex
CREATE INDEX "Contract_end_date_idx" ON "Contract"("end_date");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_contract_id_sequence_key" ON "Invoice"("contract_id", "sequence");
