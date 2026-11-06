-- CreateTable
CREATE TABLE "InvoicePayment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contract_id" TEXT NOT NULL,
    "invoice_number" INTEGER NOT NULL,
    "paid_date" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePayment_contract_id_invoice_number_key" ON "InvoicePayment"("contract_id", "invoice_number");
