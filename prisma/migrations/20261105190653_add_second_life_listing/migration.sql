-- CreateTable
CREATE TABLE "SecondLifeListing" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asset_id" TEXT NOT NULL,
    "listed_on" TEXT NOT NULL,
    "condition_before" TEXT NOT NULL,
    "usage_before" INTEGER NOT NULL,
    "condition_after" TEXT NOT NULL,
    "usage_after" INTEGER NOT NULL,
    "refurbishment_cents" INTEGER NOT NULL,
    "list_price_cents" INTEGER NOT NULL,
    "valuation_json" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "SecondLifeListing_asset_id_idx" ON "SecondLifeListing"("asset_id");
