-- CreateTable
CREATE TABLE "CompanySignatory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "granted_by" TEXT NOT NULL,
    "granted_on" TEXT NOT NULL,
    "valid_from" TEXT,
    "valid_to" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanySignatory_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SignatureRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "application_id" TEXT NOT NULL,
    "signatory_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "sent_on" TEXT NOT NULL,
    "opened_on" TEXT,
    "signed_on" TEXT,
    "declined_on" TEXT,
    "expires_on" TEXT NOT NULL,
    CONSTRAINT "SignatureRequest_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SignatureRequest_signatory_id_fkey" FOREIGN KEY ("signatory_id") REFERENCES "CompanySignatory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CompanySignatory_customer_id_idx" ON "CompanySignatory"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "SignatureRequest_token_key" ON "SignatureRequest"("token");

-- CreateIndex
CREATE INDEX "SignatureRequest_application_id_idx" ON "SignatureRequest"("application_id");

-- CreateIndex
CREATE INDEX "SignatureRequest_signatory_id_idx" ON "SignatureRequest"("signatory_id");
