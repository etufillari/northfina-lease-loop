// Fills an empty database with one example of every state. Run by `npm run db:demo`, which
// resets the database first. A plain `db:setup` or `db:seed` never adds any of this.
import { existsSync } from 'node:fs';
import { DEMO_DATE, DEMO_GUIDE, seedDemoScenario } from '@/server/demo/demo-scenario';
import { createPrismaClient } from '@/server/prisma-client';

if (existsSync('.env')) process.loadEnvFile('.env');

const db = createPrismaClient();
try {
  await seedDemoScenario(db);
  console.log(`🎬 Demo ready. The app now runs on ${DEMO_DATE}.\n`);
  console.table(DEMO_GUIDE);
} finally {
  await db.$disconnect();
}
