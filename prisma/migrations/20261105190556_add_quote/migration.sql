-- CreateTable
CREATE TABLE "Quote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asset_id" TEXT NOT NULL,
    "quote_date" TEXT NOT NULL,
    "valid_until" TEXT NOT NULL,
    "price_list_version" INTEGER NOT NULL,
    "term_months" INTEGER NOT NULL,
    "down_payment_cents" INTEGER NOT NULL,
    "monthly_net_rent_cents" INTEGER NOT NULL,
    "terms_json" TEXT NOT NULL,
    "replaces_quote_id" INTEGER,
    "contract_id" INTEGER
);

-- CreateIndex
CREATE INDEX "Quote_asset_id_idx" ON "Quote"("asset_id");

-- CreateIndex
CREATE INDEX "Quote_contract_id_idx" ON "Quote"("contract_id");
