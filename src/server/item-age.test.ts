// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { quoteAndSign } from '../../tests/helpers/quote-and-sign';
import { createTestDb } from '../../tests/helpers/test-db';
import { loadAssets } from '@/data/load';
import { seedAssets } from './assets';
import type { LeaseDataPack } from './contracts';
import { ageClockFor } from './item-age';
import { loadLeaseDataPack } from './lease-data';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let data: LeaseDataPack;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  data = await loadLeaseDataPack();
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.contractEnding.deleteMany();
  await db.contract.deleteMany();
  await db.quote.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

describe('ageClockFor', () => {
  it('starts a new item from its first lease (card 1: ebike-003, 5 Nov 2026)', async () => {
    const signed = await quoteAndSign(db, data, {
      assetId: 'ebike-003',
      customerId: 'cust-aino',
      termMonths: 36,
      downPaymentCents: 0,
      answers: {
        q_customer_type: 'consumer',
        q_full_name: 'Aino Virtanen',
        q_birth_date: '1997-04-12',
        q_email: 'aino.virtanen@example.com',
        q_country: 'FI',
        q_employment: 'employed',
        q_monthly_income: 320_000,
        q_usage_purpose: 'commuting',
      },
      today: '2026-11-05',
      actor: 'cust-aino',
    });
    if (!signed.ok) throw new Error(signed.reason);
    expect(await ageClockFor(db, 'ebike-003')).toEqual({
      modelYear: 2026,
      firstLeasedNewOn: '2026-11-05',
    });
  });

  it('a new item never leased, or a used one, counts from its model year', async () => {
    expect(await ageClockFor(db, 'ebike-003')).toEqual({ modelYear: 2026, firstLeasedNewOn: null });
    // ebike-007: 2023, fair, 18 400 km in the data pack.
    expect(await ageClockFor(db, 'ebike-007')).toEqual({ modelYear: 2023, firstLeasedNewOn: null });
  });

  it('is null for an unknown item', async () => {
    expect(await ageClockFor(db, 'nope-001')).toBeNull();
  });
});
