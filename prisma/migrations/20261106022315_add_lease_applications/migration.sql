-- CreateTable
CREATE TABLE "LeaseApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "answersJson" TEXT NOT NULL,
    "reasonsJson" TEXT NOT NULL,
    "itemsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeaseApplication_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LeaseApplication_customerId_createdAt_idx" ON "LeaseApplication"("customerId", "createdAt");
