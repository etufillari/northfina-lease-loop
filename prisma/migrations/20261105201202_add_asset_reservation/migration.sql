-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "reserved_by" TEXT;
ALTER TABLE "Asset" ADD COLUMN "reserved_until" DATETIME;
