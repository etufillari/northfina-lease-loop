-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "bought_date" TEXT;
ALTER TABLE "Contract" ADD COLUMN "buyout_paid_cents" INTEGER;

-- CreateTable
CREATE TABLE "Handover" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contract_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "from_name" TEXT NOT NULL,
    "to_customer_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "passed_date" TEXT NOT NULL,
    "decided_date" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "Handover_contract_id_key" ON "Handover"("contract_id");

-- CreateIndex
CREATE INDEX "Handover_to_customer_id_idx" ON "Handover"("to_customer_id");
