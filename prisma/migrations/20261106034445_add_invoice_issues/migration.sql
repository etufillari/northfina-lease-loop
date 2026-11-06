-- CreateTable
CREATE TABLE "InvoiceIssue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contract_id" TEXT NOT NULL,
    "invoice_number" INTEGER NOT NULL,
    "issued_date" TEXT NOT NULL,
    "net_cents" INTEGER NOT NULL,
    "vat_basis_points" INTEGER NOT NULL,
    "vat_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceIssue_contract_id_invoice_number_key" ON "InvoiceIssue"("contract_id", "invoice_number");
