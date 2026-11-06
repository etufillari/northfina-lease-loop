-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "startCondition" TEXT;
ALTER TABLE "Contract" ADD COLUMN "startUsageValue" INTEGER;

-- CreateTable
CREATE TABLE "LeaseActionPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "quoteJson" TEXT NOT NULL,
    "isSimulated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeaseActionPayment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaseActionPayment_reference_key" ON "LeaseActionPayment"("reference");

-- CreateIndex
CREATE INDEX "LeaseActionPayment_contractId_idx" ON "LeaseActionPayment"("contractId");
