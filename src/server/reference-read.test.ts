// Tests round-tripping reference data from SQLite (seeded via seedReferenceData) back into
// the domain schemas, plus the fallback when tables are empty.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import type { PrismaClient } from './prisma-client';
import {
  bpToFraction,
  bpToPercent,
  ppmToFraction,
  readCo2Factors,
  readCoefficientTable,
  readPriceLists,
  readQuestions,
  readResidualCurves,
  readSecondLifeDemand,
  readVatRates,
} from './reference-read';
import { seedReferenceData, type ReferenceDataPack } from './reference-seed';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let pack: ReferenceDataPack;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  pack = {
    priceLists: await loadPriceLists(),
    coefficientTable: await loadCoefficientTable(),
    vatRates: await loadVatRates(),
    residualCurves: await loadResidualCurves(),
    refurbishmentCosts: await loadRefurbishmentCosts(),
    secondLifeDemand: await loadSecondLifeDemand(),
    questions: await loadQuestions(),
    customers: await loadCustomers(),
    co2Factors: await loadCo2Factors(),
  };
  await seedAssets(db, await loadAssets());
});

afterAll(async () => {
  await cleanup();
});

describe('unit inverse conversions', () => {
  it('converts basis points and parts per million back to exact decimals', () => {
    expect(bpToPercent(2550)).toBe(25.5);
    expect(bpToPercent(990)).toBe(9.9);
    expect(bpToFraction(9500)).toBe(0.95);
    expect(ppmToFraction(27584)).toBe(0.027584);
  });
});

describe('reference-read fallback on empty DB', () => {
  it('falls back to data pack files before reference tables are seeded', async () => {
    expect(await readPriceLists(db)).toEqual(pack.priceLists);
    expect(await readCoefficientTable(db)).toEqual(pack.coefficientTable);
    expect(await readVatRates(db)).toEqual(pack.vatRates);
    expect(await readResidualCurves(db)).toEqual(pack.residualCurves);
    expect(await readSecondLifeDemand(db)).toEqual(pack.secondLifeDemand);
    expect(await readQuestions(db)).toEqual(pack.questions);
    expect(await readCo2Factors(db)).toEqual(pack.co2Factors);
  });
});

describe('reference-read from seeded SQLite tables', () => {
  beforeAll(async () => {
    await seedReferenceData(db, pack);
  });

  it('round-trips price lists from SQLite', async () => {
    const lists = await readPriceLists(db);
    expect(lists).toEqual(pack.priceLists);
  });

  it('round-trips the coefficient table from SQLite', async () => {
    const table = await readCoefficientTable(db);
    expect(table).toEqual(pack.coefficientTable);
  });

  it('round-trips VAT rates from SQLite', async () => {
    const vat = await readVatRates(db);
    expect(vat.country).toBe(pack.vatRates.country);
    expect(vat.rates).toEqual(pack.vatRates.rates);
  });

  it('round-trips residual curves, condition multipliers, and usage adjustments from SQLite', async () => {
    const residual = await readResidualCurves(db);
    expect(residual.curves).toEqual(pack.residualCurves.curves);
    expect(residual.condition_multiplier).toEqual(pack.residualCurves.condition_multiplier);
    expect(residual.usage_adjustment).toEqual(pack.residualCurves.usage_adjustment);
  });

  it('round-trips second-life waiting list in signup order from SQLite', async () => {
    const demand = await readSecondLifeDemand(db);
    expect(demand).toEqual(pack.secondLifeDemand);
  });

  it('round-trips questions and eligibility rules in bank order from SQLite', async () => {
    const questions = await readQuestions(db);
    expect(questions.questions).toEqual(pack.questions.questions);
    expect(questions.eligibility_rules).toEqual(pack.questions.eligibility_rules);
  });

  it('round-trips CO2 manufacturing factors and settings from SQLite', async () => {
    const co2 = await readCo2Factors(db);
    expect(co2).toEqual(pack.co2Factors);
  });

  it('reflects database edits so callers genuinely read SQLite', async () => {
    await db.priceListEntry.update({
      where: { price_list_version_asset_id: { price_list_version: 1, asset_id: 'ebike-003' } },
      data: { price_cents: 400_000 },
    });
    const lists = await readPriceLists(db);
    expect(lists[0]?.prices['ebike-003']).toBe(400_000);

    // Restore
    await db.priceListEntry.update({
      where: { price_list_version_asset_id: { price_list_version: 1, asset_id: 'ebike-003' } },
      data: { price_cents: 389_000 },
    });
  });
});
