-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "reserved_for" TEXT;
ALTER TABLE "Asset" ADD COLUMN "second_life_price_cents" INTEGER;

-- CreateTable
CREATE TABLE "Refurbishment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asset_id" TEXT NOT NULL,
    "refurbished_date" TEXT NOT NULL,
    "condition_before" TEXT NOT NULL,
    "condition_after" TEXT NOT NULL,
    "usage_before" INTEGER NOT NULL,
    "usage_after" INTEGER NOT NULL,
    "steps_json" TEXT NOT NULL,
    "cost_cents" INTEGER NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "notes" TEXT,
    "actor" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Refurbishment_asset_id_idx" ON "Refurbishment"("asset_id");
