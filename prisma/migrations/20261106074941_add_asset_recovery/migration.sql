-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "annualRateBasisPoints" INTEGER;

-- AlterTable
ALTER TABLE "LeaseRequest" ADD COLUMN "customerReportJson" TEXT;

-- CreateTable
CREATE TABLE "ReturnAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "assessedBy" TEXT NOT NULL,
    "inspectionJson" TEXT NOT NULL,
    "calculationJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'quoted',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReturnAssessment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "LeaseRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "model_year" INTEGER NOT NULL,
    "serial_number" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "usage_unit" TEXT NOT NULL,
    "usage_value" INTEGER NOT NULL,
    "previous_lives" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "originalPriceCents" INTEGER,
    "firstLeaseDate" TEXT,
    "secondLifePriceCents" INTEGER,
    "maintenanceUsageValue" INTEGER NOT NULL DEFAULT 0,
    "priceRevision" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_Asset" ("category", "condition", "created_at", "id", "make", "model", "model_year", "previous_lives", "serial_number", "status", "updated_at", "usage_unit", "usage_value") SELECT "category", "condition", "created_at", "id", "make", "model", "model_year", "previous_lives", "serial_number", "status", "updated_at", "usage_unit", "usage_value" FROM "Asset";
DROP TABLE "Asset";
ALTER TABLE "new_Asset" RENAME TO "Asset";
CREATE UNIQUE INDEX "Asset_serial_number_key" ON "Asset"("serial_number");
CREATE INDEX "Asset_category_idx" ON "Asset"("category");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ReturnAssessment_requestId_key" ON "ReturnAssessment"("requestId");
