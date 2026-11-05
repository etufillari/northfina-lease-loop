-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quote_date" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "customer_type" TEXT NOT NULL,
    "applicant_name" TEXT,
    "term_months" INTEGER NOT NULL,
    "down_payment_cents" INTEGER NOT NULL,
    "list_price_cents" INTEGER NOT NULL,
    "price_list_version" INTEGER NOT NULL,
    "financed_cents" INTEGER NOT NULL,
    "monthly_net_cents" INTEGER NOT NULL,
    "vat_basis_points" INTEGER NOT NULL,
    "monthly_gross_cents" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "reasons_json" TEXT NOT NULL,
    "answers_json" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Application_asset_id_idx" ON "Application"("asset_id");
