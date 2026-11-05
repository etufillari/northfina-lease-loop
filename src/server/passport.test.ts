// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { quoteAndSign } from '../../tests/helpers/quote-and-sign';
import { loadAssets } from '@/data/load';
import { seedAssets } from './assets';
import type { LeaseDataPack } from './contracts';
import { loadLeaseDataPack } from './lease-data';
import { passportView } from './passport';
import type { PrismaClient } from './prisma-client';
import { loadSecondLifeDataPack, relistAsset, type SecondLifeDataPack } from './second-life';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let lease: LeaseDataPack;
let data: SecondLifeDataPack;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  [lease, data] = await Promise.all([loadLeaseDataPack(), loadSecondLifeDataPack()]);
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.secondLifeListing.deleteMany();
  await db.contractEnding.deleteMany();
  await db.contract.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

const TODAY = '2026-11-06';
const ainoAnswers = {
  q_customer_type: 'consumer',
  q_full_name: 'Aino Virtanen',
  q_birth_date: '1997-04-12',
  q_email: 'aino.virtanen@example.com',
  q_country: 'FI',
  q_employment: 'employed',
  q_monthly_income: 320_000,
  q_usage_purpose: 'commuting',
};

describe('passportView', () => {
  it('is null for an unknown item', async () => {
    expect(await passportView(db, 'nope-001')).toBeNull();
  });

  it('a new item has no lives', async () => {
    const view = await passportView(db, 'ebike-003');
    expect(view?.passport).toEqual({
      earlierLives: [],
      lives: [],
      nextListing: null,
      avoidedKg: 0,
    });
  });

  it('card 10: ebike-008 re-listed and leased again shows life 3 and 26 kg avoided', async () => {
    const before = await passportView(db, 'ebike-008');
    expect(before?.passport.earlierLives.map((life) => life.number)).toEqual([1, 2]);
    expect(before?.passport.lives).toEqual([]);

    const relisted = await relistAsset(db, data, {
      assetId: 'ebike-008',
      target: 'good',
      today: TODAY,
      actor: 's',
    });
    expect(relisted.ok).toBe(true);
    expect((await passportView(db, 'ebike-008'))?.passport.nextListing).toMatchObject({
      listPriceCents: 32_601,
      refurbishmentCents: 4_500,
    });

    const signed = await quoteAndSign(db, lease, {
      assetId: 'ebike-008',
      customerId: 'cust-aino',
      termMonths: 36,
      downPaymentCents: 0,
      answers: ainoAnswers,
      today: TODAY,
      actor: 'cust-aino',
    });
    expect(signed.ok).toBe(true);

    const after = await passportView(db, 'ebike-008');
    // 165 × 0.88 × 0.26 × 0.85 × 0.82 = 26.313 → 26 kg (src/domain/co2.test.ts)
    expect(after?.passport).toMatchObject({
      nextListing: null,
      avoidedKg: 26,
      lives: [
        {
          number: 3,
          ageMonths: 58,
          delivered: { condition: 'good', usageValue: 9_800 },
          refurbishment: { listPriceCents: 32_601 },
          contract: { customerId: 'cust-aino', monthlyNetRentCents: 933, ending: null },
          co2: { avoidedKg: 26 },
        },
      ],
    });
  });
});
