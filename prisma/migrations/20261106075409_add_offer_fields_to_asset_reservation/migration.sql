-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AssetReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asset_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "reservation_type" TEXT NOT NULL DEFAULT 'standard',
    "offered_on" TEXT,
    "list_price_cents" INTEGER,
    "price_list_version" INTEGER,
    "term_months" INTEGER,
    "down_payment_cents" INTEGER,
    "monthly_net_rent_cents" INTEGER,
    "monthly_gross_rent_cents" INTEGER,
    "buyout_net_cents" INTEGER,
    "quote_json" TEXT,
    CONSTRAINT "AssetReservation_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AssetReservation" ("actor", "asset_id", "created_at", "expires_at", "id", "status", "token", "updated_at") SELECT "actor", "asset_id", "created_at", "expires_at", "id", "status", "token", "updated_at" FROM "AssetReservation";
DROP TABLE "AssetReservation";
ALTER TABLE "new_AssetReservation" RENAME TO "AssetReservation";
CREATE UNIQUE INDEX "AssetReservation_token_key" ON "AssetReservation"("token");
CREATE INDEX "AssetReservation_asset_id_idx" ON "AssetReservation"("asset_id");
CREATE INDEX "AssetReservation_token_idx" ON "AssetReservation"("token");
CREATE INDEX "AssetReservation_status_idx" ON "AssetReservation"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
