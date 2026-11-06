-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customer_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "term_months" INTEGER NOT NULL,
    "monthly_net_cents" INTEGER NOT NULL,
    "payment_due_days" INTEGER NOT NULL,
    "price_list_version" INTEGER NOT NULL,
    "offer_expires_on" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "decision_reason" TEXT NOT NULL,
    "signing_authority" BOOLEAN NOT NULL,
    "submitted_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signed_at" DATETIME
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "application_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "term_months" INTEGER NOT NULL,
    "monthly_net_cents" INTEGER NOT NULL,
    "payment_due_days" INTEGER NOT NULL,
    "price_list_version" INTEGER NOT NULL,
    "signer_id" TEXT NOT NULL,
    "signed_at" DATETIME NOT NULL,
    CONSTRAINT "Contract_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "Application" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Application_customer_id_idx" ON "Application"("customer_id");

-- CreateIndex
CREATE INDEX "Application_asset_id_idx" ON "Application"("asset_id");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_application_id_key" ON "Contract"("application_id");

-- CreateIndex
CREATE INDEX "Contract_customer_id_idx" ON "Contract"("customer_id");

-- CreateIndex
CREATE INDEX "Contract_asset_id_idx" ON "Contract"("asset_id");
