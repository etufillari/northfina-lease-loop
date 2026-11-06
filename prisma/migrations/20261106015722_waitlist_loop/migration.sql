-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "second_life_price_cents" INTEGER;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN "waitlist_entry_id" TEXT;

-- AlterTable
ALTER TABLE "WaitlistEntry" ADD COLUMN "customer_id" TEXT;
ALTER TABLE "WaitlistEntry" ADD COLUMN "left_reason" TEXT;

-- CreateIndex
CREATE INDEX "Reservation_waitlist_entry_id_idx" ON "Reservation"("waitlist_entry_id");

-- CreateIndex
CREATE INDEX "WaitlistEntry_customer_id_idx" ON "WaitlistEntry"("customer_id");
