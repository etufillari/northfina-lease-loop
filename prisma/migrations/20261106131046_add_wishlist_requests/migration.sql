-- CreateTable
CREATE TABLE "WishlistRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "asset_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "minimum_condition" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    CONSTRAINT "WishlistRequest_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WishlistRequest_asset_id_status_idx" ON "WishlistRequest"("asset_id", "status");

-- CreateIndex
CREATE INDEX "WishlistRequest_customer_id_status_idx" ON "WishlistRequest"("customer_id", "status");
