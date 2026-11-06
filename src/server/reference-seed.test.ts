// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
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

describe('seedReferenceData', () => {
  it('writes every reference table from the data pack', async () => {
    const counts = await seedReferenceData(db, pack);
    expect(counts).toMatchObject({ priceLists: 2, priceListEntries: 60, customers: 10 });
    expect(await db.priceListEntry.count()).toBe(60);
    expect(await db.coefficientFactor.count()).toBe(16);
    expect(await db.customer.count()).toBe(10);
    expect(await db.question.count()).toBe(pack.questions.questions.length);
    expect(await db.secondLifeRequest.count()).toBe(pack.secondLifeDemand.length);
    expect(await db.co2Settings.count()).toBe(1);
  });

  it('stores the worked example from data/DATA.md exactly', async () => {
    await seedReferenceData(db, pack);
    const price = await db.priceListEntry.findUniqueOrThrow({
      where: { price_list_version_asset_id: { price_list_version: 1, asset_id: 'ebike-003' } },
    });
    const factor = await db.coefficientFactor.findUniqueOrThrow({
      where: { table_id_band_term_months: { table_id: 'ct-2026-1', band: 'B', term_months: 36 } },
    });
    const vat = await db.vatRate.findUniqueOrThrow({
      where: { country_valid_from: { country: 'FI', valid_from: '2024-09-01' } },
    });
    expect([price.price_cents, factor.factor_ppm, vat.rate_bp]).toEqual([389000, 27584, 2550]);
  });

  it('is safe to run again and does not duplicate rows', async () => {
    await seedReferenceData(db, pack);
    await seedReferenceData(db, pack);
    expect(await db.priceListEntry.count()).toBe(60);
    expect(await db.vatRate.count()).toBe(3);
    expect(await db.customer.count()).toBe(10);
  });

  it('updates rows to match changed data, including reordered questions', async () => {
    await seedReferenceData(db, pack);
    const reversed = [...pack.questions.questions].reverse();
    await seedReferenceData(db, {
      ...pack,
      questions: { ...pack.questions, questions: reversed },
      vatRates: {
        ...pack.vatRates,
        rates: pack.vatRates.rates.map((r) =>
          r.valid_from === '2027-01-01' ? { ...r, rate_percent: 27 } : r
        ),
      },
    });
    const first = await db.question.findFirstOrThrow({ orderBy: { position: 'asc' } });
    expect(first.id).toBe(reversed[0]?.id);
    const future = await db.vatRate.findUniqueOrThrow({
      where: { country_valid_from: { country: 'FI', valid_from: '2027-01-01' } },
    });
    expect(future.rate_bp).toBe(2700);

    await seedReferenceData(db, pack); // restore for any later test
  });
});
