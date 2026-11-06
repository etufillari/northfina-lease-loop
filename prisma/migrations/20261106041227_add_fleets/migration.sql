-- AlterTable
ALTER TABLE "Application" ADD COLUMN "fleet_id" TEXT;

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "fleet_id" TEXT;

-- CreateIndex
CREATE INDEX "Application_fleet_id_idx" ON "Application"("fleet_id");

-- CreateIndex
CREATE INDEX "Contract_fleet_id_idx" ON "Contract"("fleet_id");
