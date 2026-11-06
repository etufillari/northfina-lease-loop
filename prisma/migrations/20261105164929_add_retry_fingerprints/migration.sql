/*
  Warnings:

  - Added the required column `request_hash` to the `Application` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AssetRelease" ADD COLUMN "relist_request_hash" TEXT;

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "close_request_hash" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quote_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "submitted_on" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "answers_json" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reasons_json" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Application_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "Quote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Application" ("answers_json", "created_at", "customer_id", "decision", "id", "quote_id", "reasons_json", "submitted_on") SELECT "answers_json", "created_at", "customer_id", "decision", "id", "quote_id", "reasons_json", "submitted_on" FROM "Application";
DROP TABLE "Application";
ALTER TABLE "new_Application" RENAME TO "Application";
CREATE INDEX "Application_quote_id_idx" ON "Application"("quote_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
