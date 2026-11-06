-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "hash" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "prev_hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_prev_hash_key" ON "AuditLog"("prev_hash");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_hash_key" ON "AuditLog"("hash");

