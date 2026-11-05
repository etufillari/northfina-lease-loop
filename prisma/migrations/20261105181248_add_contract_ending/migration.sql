-- CreateTable
CREATE TABLE "ContractEnding" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contract_id" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "decided_on" TEXT NOT NULL,
    "effective_date" TEXT NOT NULL,
    "ending_json" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractEnding_contract_id_key" ON "ContractEnding"("contract_id");
