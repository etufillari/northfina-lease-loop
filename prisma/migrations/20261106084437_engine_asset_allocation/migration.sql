-- CreateTable
CREATE TABLE "EngineAllocation" (
    "assetId" TEXT NOT NULL PRIMARY KEY,
    "leaseId" TEXT NOT NULL,
    CONSTRAINT "EngineAllocation_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "EngineLease" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EngineAllocation_leaseId_key" ON "EngineAllocation"("leaseId");
