-- AlterTable
ALTER TABLE "Application" ADD COLUMN "customer_id" TEXT;

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "customer_id" TEXT;

-- CreateIndex
CREATE INDEX "Application_customer_id_idx" ON "Application"("customer_id");

-- CreateIndex
CREATE INDEX "Contract_customer_id_idx" ON "Contract"("customer_id");
