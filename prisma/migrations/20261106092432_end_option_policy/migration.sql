-- AlterTable
ALTER TABLE "Application" ADD COLUMN "termination_policy" TEXT;

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "termination_policy" TEXT;

-- AlterTable
ALTER TABLE "EngineLease" ADD COLUMN "terminatedOn" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LeaseSettlement" (
    "leaseId" TEXT NOT NULL PRIMARY KEY,
    "option" TEXT NOT NULL,
    "netCents" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL,
    "grossCents" INTEGER NOT NULL,
    "effectiveOn" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL DEFAULT 'EXIT_CAP_BUYOUT_V1'
);
INSERT INTO "new_LeaseSettlement" ("effectiveOn", "grossCents", "leaseId", "netCents", "option", "vatCents") SELECT "effectiveOn", "grossCents", "leaseId", "netCents", "option", "vatCents" FROM "LeaseSettlement";
DROP TABLE "LeaseSettlement";
ALTER TABLE "new_LeaseSettlement" RENAME TO "LeaseSettlement";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
