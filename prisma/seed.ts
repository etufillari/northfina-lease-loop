// Fills the database from the data pack. Run by `npm run db:setup` (via `prisma db seed`).
// Safe to run again:
// - Assets: only missing ones are added; status changes you made are never overwritten.
// - Everything else in data/ (price lists, coefficient table, VAT, residual curves,
//   refurbishment costs, waiting list, questions, customers, CO2 factors) is upserted,
//   so the rows always match the files.
import {
  loadAssets,
  loadCo2Factors,
  loadCoefficientTable,
  loadCustomers,
  loadPriceLists,
  loadQuestions,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadSecondLifeDemand,
  loadVatRates,
} from '@/data/load';
import { seedAssets } from '@/server/assets';
import { createPrismaClient } from '@/server/prisma-client';
import { seedReferenceData } from '@/server/reference-seed';

const db = createPrismaClient();
try {
  // Assets first: price list entries point to them.
  const { created, skipped } = await seedAssets(db, await loadAssets());
  console.log(`🌱 Seeded ${created} new assets (${skipped} were already there).`);

  const counts = await seedReferenceData(db, {
    priceLists: await loadPriceLists(),
    coefficientTable: await loadCoefficientTable(),
    vatRates: await loadVatRates(),
    residualCurves: await loadResidualCurves(),
    refurbishmentCosts: await loadRefurbishmentCosts(),
    secondLifeDemand: await loadSecondLifeDemand(),
    questions: await loadQuestions(),
    customers: await loadCustomers(),
    co2Factors: await loadCo2Factors(),
  });
  const summary = Object.entries(counts)
    .map(([table, n]) => `${table} ${n}`)
    .join(', ');
  console.log(`🌱 Upserted reference data: ${summary}.`);
} finally {
  await db.$disconnect();
}
