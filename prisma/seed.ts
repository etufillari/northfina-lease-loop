// Fills the database from the data pack. Run by `npm run db:setup` (via `prisma db seed`).
// Safe to run again: it only adds what is missing and never overwrites your changes.
import { loadAssets } from '@/data/load';
import { seedAssets } from '@/server/assets';
import { seedDemoCases } from '@/server/demo-cases';
import { seedDemoLeases } from '@/server/demo-history';
import { createPrismaClient } from '@/server/prisma-client';
import { todayIso } from '@/server/today';

const db = createPrismaClient();
try {
  const { created, skipped } = await seedAssets(db, await loadAssets());
  console.log(`🌱 Seeded ${created} new assets (${skipped} were already there).`);
  if (process.env.NODE_ENV === 'production') {
    console.log('Skipped simulated trading history: this is a production environment.');
  } else {
    const today = todayIso();
    const leases = await seedDemoLeases(db, today);
    const cases = await seedDemoCases(db, today);
    console.log(
      `📈 Simulated history: ${leases.created} new leases (${leases.skipped} were already there), ${cases.created} open cases.`
    );
  }
} finally {
  await db.$disconnect();
}
