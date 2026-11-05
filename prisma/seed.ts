// Fills the database from the data pack. Run by `npm run db:setup` (via `prisma db seed`).
// Safe to run again: it only adds rows that are missing and never overwrites your changes.
import { loadAssets, loadCustomers, loadSecondLifeDemand } from '@/data/load';
import { seedAssets } from '@/server/assets';
import { seedCustomers } from '@/server/customers';
import { seedWaitlist } from '@/server/waitlist';
import { createPrismaClient } from '@/server/prisma-client';

const db = createPrismaClient();
try {
  const assets = await seedAssets(db, await loadAssets());
  console.log(`🌱 Seeded ${assets.created} new assets (${assets.skipped} were already there).`);
  const customers = await seedCustomers(db, await loadCustomers());
  console.log(
    `🌱 Seeded ${customers.created} new customers (${customers.skipped} were already there).`
  );
  const waitlist = await seedWaitlist(db, await loadSecondLifeDemand());
  console.log(
    `🌱 Seeded ${waitlist.created} waiting-list entries (${waitlist.skipped} were already there).`
  );
} finally {
  await db.$disconnect();
}
