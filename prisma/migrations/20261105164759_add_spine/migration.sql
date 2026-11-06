-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customer_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "priced_on" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "valid_through" TEXT NOT NULL,
    "release_revision" INTEGER NOT NULL,
    "price_source" TEXT NOT NULL,
    "terms_json" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Quote_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quote_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "submitted_on" TEXT NOT NULL,
    "answers_json" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reasons_json" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Application_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "Quote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quote_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "life_number" INTEGER NOT NULL,
    "signed_on" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "terms_json" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "closed_on" TEXT,
    "close_request_id" TEXT,
    "next_customer_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Contract_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "Quote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contract_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "Application" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contract_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetLease" (
    "asset_id" TEXT NOT NULL PRIMARY KEY,
    "contract_id" TEXT NOT NULL,
    CONSTRAINT "AssetLease_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssetLease_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contract_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "scheduled_for" TEXT NOT NULL,
    "invoice_date" TEXT NOT NULL,
    "due_date" TEXT NOT NULL,
    "net_cents" INTEGER NOT NULL,
    "vat_basis_points" INTEGER NOT NULL,
    "vat_cents" INTEGER NOT NULL,
    "gross_cents" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetRelease" (
    "asset_id" TEXT NOT NULL PRIMARY KEY,
    "revision" INTEGER NOT NULL,
    "net_price_cents" INTEGER,
    "ready_on" TEXT,
    "reserved_for_customer_id" TEXT,
    "readiness_json" TEXT,
    "valuation_reason" TEXT,
    "relist_request_id" TEXT,
    CONSTRAINT "AssetRelease_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Quote_customer_id_idx" ON "Quote"("customer_id");

-- CreateIndex
CREATE INDEX "Application_quote_id_idx" ON "Application"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_quote_id_key" ON "Contract"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_application_id_key" ON "Contract"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_close_request_id_key" ON "Contract"("close_request_id");

-- CreateIndex
CREATE INDEX "Contract_customer_id_idx" ON "Contract"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_asset_id_life_number_key" ON "Contract"("asset_id", "life_number");

-- CreateIndex
CREATE UNIQUE INDEX "AssetLease_contract_id_key" ON "AssetLease"("contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_contract_id_kind_period_key" ON "Invoice"("contract_id", "kind", "period");

-- CreateIndex
CREATE UNIQUE INDEX "AssetRelease_relist_request_id_key" ON "AssetRelease"("relist_request_id");
