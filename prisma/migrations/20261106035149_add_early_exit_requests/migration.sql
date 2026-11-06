-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "annual_interest_basis_points" INTEGER;
ALTER TABLE "Contract" ADD COLUMN "terminated_on" TEXT;
ALTER TABLE "Contract" ADD COLUMN "termination_action" TEXT;

-- CreateTable
CREATE TABLE "EarlyExitRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contract_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requested_on" TEXT NOT NULL,
    "effective_on" TEXT NOT NULL,
    "settlement_net_cents" INTEGER NOT NULL,
    "vat_rate_basis_points" INTEGER NOT NULL,
    "vat_cents" INTEGER NOT NULL,
    "settlement_total_cents" INTEGER NOT NULL,
    "settlement_paid_cents" INTEGER,
    "quote_snapshot_json" TEXT NOT NULL,
    "completed_on" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "EarlyExitRequest_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EarlyExitRequest_contract_id_key" ON "EarlyExitRequest"("contract_id");

-- CreateIndex
CREATE INDEX "EarlyExitRequest_status_effective_on_idx" ON "EarlyExitRequest"("status", "effective_on");
