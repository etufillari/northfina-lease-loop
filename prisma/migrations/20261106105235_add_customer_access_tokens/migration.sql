-- CreateTable
CREATE TABLE "CustomerAccessToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" DATETIME NOT NULL,
    "token_hash" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    CONSTRAINT "CustomerAccessToken_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAccessToken_token_hash_key" ON "CustomerAccessToken"("token_hash");

-- CreateIndex
CREATE INDEX "CustomerAccessToken_contract_id_idx" ON "CustomerAccessToken"("contract_id");

-- CreateIndex
CREATE INDEX "CustomerAccessToken_expires_at_idx" ON "CustomerAccessToken"("expires_at");
