-- CreateTable
CREATE TABLE "BuyoutRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "contract_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "buyout_net_cents" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    CONSTRAINT "BuyoutRequest_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BuyoutRequest_contract_id_status_idx" ON "BuyoutRequest"("contract_id", "status");

-- CreateIndex
CREATE INDEX "BuyoutRequest_customer_id_idx" ON "BuyoutRequest"("customer_id");
