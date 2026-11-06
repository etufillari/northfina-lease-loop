-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "reserved_for" TEXT;

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "passed_to" TEXT;
