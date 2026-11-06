// Demo reset: puts the database back to the data pack's start state, so a demo can be replayed
// from the beginning after time travel (which only moves forward) has run contracts, invoices
// and second lives. Everything is cleared and re-seeded in ONE transaction, with the reset
// itself as the first row of the fresh audit log. Uploaded asset photos are kept: they are
// presentation, not demo state.
import { loadAssets, loadCustomers, loadSecondLifeDemand } from '@/data/load';
import type { PrismaClient } from '@/generated/prisma/client';
import { seedAssets } from './assets';
import { withAudit } from './audit';
import { seedCustomers } from './customers';
import { seedWaitlist } from './waitlist';

/** The date a reset demo starts on: price list v1's first day, before every scenario card. */
export const DEMO_START_DATE = '2026-01-01';

export async function resetDemo(
  db: PrismaClient,
  input: { actor: string }
): Promise<{ startDate: string; assets: number; customers: number; waitlist: number }> {
  const [assets, customers, demand] = await Promise.all([
    loadAssets(),
    loadCustomers(),
    loadSecondLifeDemand(),
  ]);
  const photos = await db.asset.findMany({
    where: { image_path: { not: null } },
    select: { id: true, image_path: true },
  });

  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'demo.reset',
      entityType: 'demo',
      entityId: 'demo',
      details: { startDate: DEMO_START_DATE },
    },
    async (tx) => {
      // Children before parents, so no foreign key is ever left dangling.
      await tx.invoice.deleteMany();
      await tx.contractAsset.deleteMany();
      await tx.contract.deleteMany();
      await tx.application.deleteMany();
      await tx.quote.deleteMany();
      await tx.reservation.deleteMany();
      await tx.assetEvent.deleteMany();
      await tx.waitlistEntry.deleteMany();
      await tx.auditLog.deleteMany();
      await tx.customer.deleteMany();
      await tx.asset.deleteMany();

      await seedAssets(tx, assets);
      await seedCustomers(tx, customers);
      await seedWaitlist(tx, demand);
      for (const photo of photos) {
        await tx.asset.updateMany({
          where: { id: photo.id },
          data: { image_path: photo.image_path },
        });
      }
    }
  );
  return {
    startDate: DEMO_START_DATE,
    assets: assets.length,
    customers: customers.length,
    waitlist: demand.length,
  };
}
