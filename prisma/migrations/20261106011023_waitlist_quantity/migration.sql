-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WaitlistEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "max_monthly_net_rent_cents" INTEGER NOT NULL,
    "min_condition" TEXT NOT NULL,
    "preferred_term_months" INTEGER NOT NULL,
    "needed_by" TEXT NOT NULL,
    "joined_on" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "who" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "offered_asset_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_WaitlistEntry" ("category", "created_at", "id", "joined_on", "max_monthly_net_rent_cents", "min_condition", "needed_by", "offered_asset_id", "preferred_term_months", "status", "updated_at", "who") SELECT "category", "created_at", "id", "joined_on", "max_monthly_net_rent_cents", "min_condition", "needed_by", "offered_asset_id", "preferred_term_months", "status", "updated_at", "who" FROM "WaitlistEntry";
DROP TABLE "WaitlistEntry";
ALTER TABLE "new_WaitlistEntry" RENAME TO "WaitlistEntry";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
