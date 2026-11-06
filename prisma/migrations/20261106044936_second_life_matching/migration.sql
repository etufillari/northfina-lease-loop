-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "first_leased_on" TEXT;
ALTER TABLE "Asset" ADD COLUMN "original_list_price_cents" INTEGER;

-- CreateTable
CREATE TABLE "SecondLifeMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asset_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'accepted',
    "matched_on" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "market_value_cents" INTEGER NOT NULL,
    "term_months" INTEGER NOT NULL,
    "monthly_net_rent_cents" INTEGER NOT NULL,
    "pricing_snapshot_json" TEXT NOT NULL,
    "request_snapshot_json" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecondLifeMatch_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SecondLifeMatch_request_id_key" ON "SecondLifeMatch"("request_id");

-- CreateIndex
CREATE INDEX "SecondLifeMatch_asset_id_matched_on_idx" ON "SecondLifeMatch"("asset_id", "matched_on");
