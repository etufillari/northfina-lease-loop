-- CreateTable
CREATE TABLE "SecondLifeReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asset_id" TEXT NOT NULL,
    "waiting_request_id" TEXT NOT NULL,
    "who" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reserved_by" TEXT NOT NULL,
    "available_date" TEXT NOT NULL,
    "needed_by" TEXT NOT NULL,
    "target_condition" TEXT NOT NULL,
    "term_months" INTEGER NOT NULL,
    "monthly_net_rent_cents" INTEGER NOT NULL,
    "refurbishment_cost_cents" INTEGER NOT NULL,
    "payback_months" INTEGER NOT NULL,
    "decision_json" TEXT NOT NULL,
    CONSTRAINT "SecondLifeReservation_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SecondLifeReservation_asset_id_status_idx" ON "SecondLifeReservation"("asset_id", "status");

-- CreateIndex
CREATE INDEX "SecondLifeReservation_waiting_request_id_status_idx" ON "SecondLifeReservation"("waiting_request_id", "status");
