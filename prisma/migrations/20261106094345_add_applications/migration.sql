-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quote_id" TEXT,
    "customer_id" TEXT,
    "category" TEXT NOT NULL,
    "financed_cents" INTEGER NOT NULL,
    "contract_start_date" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reasons_json" TEXT NOT NULL,
    "answers_json" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Application_quote_id_idx" ON "Application"("quote_id");

-- CreateIndex
CREATE INDEX "Application_customer_id_idx" ON "Application"("customer_id");

-- CreateIndex
CREATE INDEX "Application_created_at_idx" ON "Application"("created_at");
