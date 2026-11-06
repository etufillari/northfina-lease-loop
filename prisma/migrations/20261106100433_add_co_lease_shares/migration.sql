-- CreateTable
CREATE TABLE "CoLeaseShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "isHolder" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoLeaseShare_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CoLeaseShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CoLeaseShare_contractId_effectiveFrom_idx" ON "CoLeaseShare"("contractId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "CoLeaseShare_contractId_userId_effectiveFrom_key" ON "CoLeaseShare"("contractId", "userId", "effectiveFrom");
