-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ReturnAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asset_id" TEXT NOT NULL,
    "contract_id" TEXT,
    "assessed_on" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "usage_value" INTEGER NOT NULL,
    "refurbishment_json" TEXT NOT NULL,
    "refurbish" BOOLEAN NOT NULL,
    "new_condition" TEXT NOT NULL,
    "market_value_cents" INTEGER NOT NULL,
    "second_life_financed_cents" INTEGER NOT NULL,
    "matched_demand_id" TEXT,
    "match_reasons_json" TEXT NOT NULL,
    "assessment_json" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReturnAssessment_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReturnAssessment_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ReturnAssessment" ("assessed_on", "asset_id", "condition", "contract_id", "created_at", "id", "market_value_cents", "match_reasons_json", "matched_demand_id", "new_condition", "refurbish", "refurbishment_json", "second_life_financed_cents", "usage_value") SELECT "assessed_on", "asset_id", "condition", "contract_id", "created_at", "id", "market_value_cents", "match_reasons_json", "matched_demand_id", "new_condition", "refurbish", "refurbishment_json", "second_life_financed_cents", "usage_value" FROM "ReturnAssessment";
DROP TABLE "ReturnAssessment";
ALTER TABLE "new_ReturnAssessment" RENAME TO "ReturnAssessment";
CREATE INDEX "ReturnAssessment_asset_id_idx" ON "ReturnAssessment"("asset_id");
CREATE INDEX "ReturnAssessment_contract_id_idx" ON "ReturnAssessment"("contract_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
