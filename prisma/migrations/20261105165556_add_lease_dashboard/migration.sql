-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "listPriceCents" INTEGER NOT NULL,
    "downPaymentCents" INTEGER NOT NULL,
    "monthlyNetCents" INTEGER NOT NULL,
    "buyoutCents" INTEGER NOT NULL,
    "priceListVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Contract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contract_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "issuedDate" TEXT NOT NULL,
    "netCents" INTEGER NOT NULL,
    "vatBasisPoints" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'issued',
    CONSTRAINT "Invoice_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidDate" TEXT NOT NULL,
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeaseRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeaseRequest_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeaseEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "eventDate" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeaseEvent_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Contract_customerId_status_idx" ON "Contract"("customerId", "status");

-- CreateIndex
CREATE INDEX "Contract_assetId_idx" ON "Contract"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_contractId_dueDate_key" ON "Invoice"("contractId", "dueDate");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "LeaseRequest_contractId_status_idx" ON "LeaseRequest"("contractId", "status");

-- CreateIndex
CREATE INDEX "LeaseEvent_contractId_eventDate_idx" ON "LeaseEvent"("contractId", "eventDate");
