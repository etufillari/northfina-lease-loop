-- CreateTable
CREATE TABLE "AssetReturn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leaseId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "usageUnit" TEXT NOT NULL,
    "usageValue" INTEGER NOT NULL,
    "receivedAt" DATETIME NOT NULL,
    CONSTRAINT "AssetReturn_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "EngineLease" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssetReturn_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RefurbishmentWork" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "returnId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "costCents" INTEGER NOT NULL,
    "mandatory" BOOLEAN NOT NULL,
    "resetsUsage" BOOLEAN NOT NULL,
    "fromCondition" TEXT,
    "toCondition" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "evidenceReference" TEXT,
    "completedAt" DATETIME,
    CONSTRAINT "RefurbishmentWork_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "AssetReturn" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetReturn_leaseId_key" ON "AssetReturn"("leaseId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetReturn_idempotencyKey_key" ON "AssetReturn"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AssetReturn_assetId_idx" ON "AssetReturn"("assetId");

-- CreateIndex
CREATE INDEX "RefurbishmentWork_returnId_status_idx" ON "RefurbishmentWork"("returnId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RefurbishmentWork_returnId_code_key" ON "RefurbishmentWork"("returnId", "code");
