/*
  Warnings:

  - A unique constraint covering the columns `[from_contract_id]` on the table `SecondLifeMatch` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "SecondLifeMatch" ADD COLUMN "from_contract_id" TEXT;
ALTER TABLE "SecondLifeMatch" ADD COLUMN "recipient_email" TEXT;
ALTER TABLE "SecondLifeMatch" ADD COLUMN "recipient_name" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SecondLifeMatch_from_contract_id_key" ON "SecondLifeMatch"("from_contract_id");
