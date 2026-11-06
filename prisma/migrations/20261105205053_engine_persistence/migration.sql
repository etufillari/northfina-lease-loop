-- CreateTable
CREATE TABLE "EngineLease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "monthlyNetCents" INTEGER NOT NULL,
    "paymentDueDays" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "EngineInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "periodIndex" INTEGER NOT NULL,
    "issueDate" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "endDateExclusive" TEXT NOT NULL,
    "netCents" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL,
    "grossCents" INTEGER NOT NULL,
    "taxJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngineInvoice_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "EngineLease" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EngineInvoiceCounter" (
    "year" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "last" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "EngineCommandReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "EngineLease_contractId_key" ON "EngineLease"("contractId");

-- CreateIndex
CREATE INDEX "EngineLease_assetId_idx" ON "EngineLease"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "EngineInvoice_number_key" ON "EngineInvoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "EngineInvoice_leaseId_periodIndex_key" ON "EngineInvoice"("leaseId", "periodIndex");

-- CreateIndex
CREATE UNIQUE INDEX "EngineCommandReceipt_actor_operation_key_key" ON "EngineCommandReceipt"("actor", "operation", "key");
