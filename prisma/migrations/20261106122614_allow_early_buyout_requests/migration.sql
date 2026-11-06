/*
  Warnings:

  - Added the required column `settlement_due_after` to the `BuyoutRequest` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BuyoutRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "contract_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "buyout_net_cents" INTEGER NOT NULL,
    "settlement_due_after" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    CONSTRAINT "BuyoutRequest_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BuyoutRequest" ("buyout_net_cents", "contract_id", "created_at", "customer_id", "id", "status", "updated_at") SELECT "buyout_net_cents", "contract_id", "created_at", "customer_id", "id", "status", "updated_at" FROM "BuyoutRequest";
DROP TABLE "BuyoutRequest";
ALTER TABLE "new_BuyoutRequest" RENAME TO "BuyoutRequest";
CREATE INDEX "BuyoutRequest_contract_id_status_idx" ON "BuyoutRequest"("contract_id", "status");
CREATE INDEX "BuyoutRequest_customer_id_idx" ON "BuyoutRequest"("customer_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
