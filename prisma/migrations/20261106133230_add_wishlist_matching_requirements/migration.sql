-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WishlistRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "asset_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "minimum_condition" TEXT NOT NULL,
    "max_monthly_net_rent_cents" INTEGER NOT NULL DEFAULT 0,
    "preferred_term_months" INTEGER NOT NULL DEFAULT 24,
    "needed_by" TEXT NOT NULL DEFAULT '9999-12-31',
    "status" TEXT NOT NULL,
    CONSTRAINT "WishlistRequest_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_WishlistRequest" ("asset_id", "created_at", "customer_id", "id", "minimum_condition", "status", "updated_at") SELECT "asset_id", "created_at", "customer_id", "id", "minimum_condition", "status", "updated_at" FROM "WishlistRequest";
DROP TABLE "WishlistRequest";
ALTER TABLE "new_WishlistRequest" RENAME TO "WishlistRequest";
CREATE INDEX "WishlistRequest_asset_id_status_idx" ON "WishlistRequest"("asset_id", "status");
CREATE INDEX "WishlistRequest_customer_id_status_idx" ON "WishlistRequest"("customer_id", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
