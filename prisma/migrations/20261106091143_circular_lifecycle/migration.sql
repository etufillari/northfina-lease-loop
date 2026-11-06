-- CreateTable
CREATE TABLE "AssetReturn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "leaseId" TEXT,
    "receivedOn" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "condition" TEXT,
    "usageValue" INTEGER,
    "planJson" TEXT,
    "completedOn" TEXT,
    "costCents" INTEGER,
    "offerNetCents" INTEGER
);

-- CreateTable
CREATE TABLE "CircularOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "netListCents" INTEGER NOT NULL,
    "publishedOn" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "LeaseSettlement" (
    "leaseId" TEXT NOT NULL PRIMARY KEY,
    "option" TEXT NOT NULL,
    "netCents" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL,
    "grossCents" INTEGER NOT NULL,
    "effectiveOn" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customer_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "term_months" INTEGER NOT NULL,
    "monthly_net_cents" INTEGER NOT NULL,
    "payment_due_days" INTEGER NOT NULL,
    "price_list_version" INTEGER NOT NULL,
    "offer_expires_on" TEXT NOT NULL,
    "down_payment_cents" INTEGER NOT NULL DEFAULT 0,
    "financed_cents" INTEGER NOT NULL DEFAULT 0,
    "buyout_net_cents" INTEGER NOT NULL DEFAULT 0,
    "circular_offer_id" TEXT,
    "status" TEXT NOT NULL,
    "decision_reason" TEXT NOT NULL,
    "signing_authority" BOOLEAN NOT NULL,
    "submitted_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signed_at" DATETIME
);
INSERT INTO "new_Application" ("asset_id", "customer_id", "decision_reason", "id", "monthly_net_cents", "offer_expires_on", "payment_due_days", "price_list_version", "signed_at", "signing_authority", "start_date", "status", "submitted_at", "term_months") SELECT "asset_id", "customer_id", "decision_reason", "id", "monthly_net_cents", "offer_expires_on", "payment_due_days", "price_list_version", "signed_at", "signing_authority", "start_date", "status", "submitted_at", "term_months" FROM "Application";
DROP TABLE "Application";
ALTER TABLE "new_Application" RENAME TO "Application";
CREATE INDEX "Application_customer_id_idx" ON "Application"("customer_id");
CREATE INDEX "Application_asset_id_idx" ON "Application"("asset_id");
CREATE INDEX "Application_status_idx" ON "Application"("status");
CREATE TABLE "new_Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "application_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "term_months" INTEGER NOT NULL,
    "monthly_net_cents" INTEGER NOT NULL,
    "payment_due_days" INTEGER NOT NULL,
    "price_list_version" INTEGER NOT NULL,
    "down_payment_cents" INTEGER NOT NULL DEFAULT 0,
    "financed_cents" INTEGER NOT NULL DEFAULT 0,
    "buyout_net_cents" INTEGER NOT NULL DEFAULT 0,
    "circular_offer_id" TEXT,
    "signer_id" TEXT NOT NULL,
    "signed_at" DATETIME NOT NULL,
    CONSTRAINT "Contract_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "Application" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Contract" ("application_id", "asset_id", "customer_id", "id", "monthly_net_cents", "payment_due_days", "price_list_version", "signed_at", "signer_id", "start_date", "term_months") SELECT "application_id", "asset_id", "customer_id", "id", "monthly_net_cents", "payment_due_days", "price_list_version", "signed_at", "signer_id", "start_date", "term_months" FROM "Contract";
DROP TABLE "Contract";
ALTER TABLE "new_Contract" RENAME TO "Contract";
CREATE UNIQUE INDEX "Contract_application_id_key" ON "Contract"("application_id");
CREATE INDEX "Contract_customer_id_idx" ON "Contract"("customer_id");
CREATE INDEX "Contract_asset_id_idx" ON "Contract"("asset_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "AssetReturn_leaseId_key" ON "AssetReturn"("leaseId");

-- CreateIndex
CREATE INDEX "AssetReturn_assetId_idx" ON "AssetReturn"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "CircularOffer_returnId_key" ON "CircularOffer"("returnId");

-- CreateIndex
CREATE INDEX "CircularOffer_assetId_idx" ON "CircularOffer"("assetId");
