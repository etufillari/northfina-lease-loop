-- CreateTable
CREATE TABLE "AssetReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asset_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "AssetReservation_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetReservation_token_key" ON "AssetReservation"("token");

-- CreateIndex
CREATE INDEX "AssetReservation_asset_id_idx" ON "AssetReservation"("asset_id");

-- CreateIndex
CREATE INDEX "AssetReservation_token_idx" ON "AssetReservation"("token");

-- CreateIndex
CREATE INDEX "AssetReservation_status_idx" ON "AssetReservation"("status");
