-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AssetReturn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "leaseId" TEXT,
    "requestedOn" TEXT,
    "receivedOn" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "condition" TEXT,
    "usageValue" INTEGER,
    "planJson" TEXT,
    "completedOn" TEXT,
    "costCents" INTEGER,
    "offerNetCents" INTEGER,
    "reviewedOn" TEXT,
    "reviewReason" TEXT
);
INSERT INTO "new_AssetReturn" ("assetId", "completedOn", "condition", "costCents", "id", "leaseId", "offerNetCents", "planJson", "receivedOn", "status", "usageValue") SELECT "assetId", "completedOn", "condition", "costCents", "id", "leaseId", "offerNetCents", "planJson", "receivedOn", "status", "usageValue" FROM "AssetReturn";
DROP TABLE "AssetReturn";
ALTER TABLE "new_AssetReturn" RENAME TO "AssetReturn";
CREATE UNIQUE INDEX "AssetReturn_leaseId_key" ON "AssetReturn"("leaseId");
CREATE INDEX "AssetReturn_assetId_idx" ON "AssetReturn"("assetId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
