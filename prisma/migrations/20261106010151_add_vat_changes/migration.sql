-- CreateTable
CREATE TABLE "VatChange" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_from" TEXT NOT NULL,
    "rate_basis_points" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "VatChange_valid_from_key" ON "VatChange"("valid_from");
