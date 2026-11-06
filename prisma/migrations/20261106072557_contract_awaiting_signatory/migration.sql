-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Contract" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asset_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "sign_date" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "terms_json" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "signatory_email" TEXT,
    "sent_on" TEXT
);
INSERT INTO "new_Contract" ("asset_id", "created_at", "customer_id", "id", "sign_date", "start_date", "terms_json") SELECT "asset_id", "created_at", "customer_id", "id", "sign_date", "start_date", "terms_json" FROM "Contract";
DROP TABLE "Contract";
ALTER TABLE "new_Contract" RENAME TO "Contract";
CREATE INDEX "Contract_asset_id_idx" ON "Contract"("asset_id");
CREATE INDEX "Contract_customer_id_idx" ON "Contract"("customer_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
