// D77 (review finding 2): an exit takes the customer's word only where it is no better than the
// item at signing, and the admin's assessment decides on the inspected condition and usage.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { payRents, signedContract } from '../../../tests/helpers/journey';
import { seedPack } from '../../../tests/helpers/invoice-fixture';
import { resetDb } from '../../../tests/helpers/reset-db';
import { createTestDb } from '../../../tests/helpers/test-db';
import { withProductionHandlers } from '../../../tests/helpers/with-handlers';
import { getAsset } from '../assets';
import { exitContract } from '../exits';
import type { PrismaClient } from '../prisma-client';
import { assessAsset } from '../second-life';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(db);
  await seedPack(db);
});
withProductionHandlers();

/** Card 9's bike relisted fair at 0 km (new battery), leased to Aino for 12 months. */
async function card9Leased() {
  await assessAsset(db, { assetId: 'ebike-007', actor: 'admin', today: '2026-11-06' });
  const trip = {
    customerId: 'cust-aino',
    assetId: 'ebike-007',
    termMonths: 12,
    quoteOn: '2026-11-06',
  };
  const { contract } = await signedContract(db, trip);
  await payRents(db, contract.id, 12, 'cust-aino');
  return contract;
}

describe('an exit checks the report against the item at signing', () => {
  it('a fair bike reported new is returned and recorded as fair', async () => {
    const contract = await card9Leased();
    const back = await exitContract(
      db,
      {
        contractId: contract.id,
        mode: 'return',
        // D83: the odometer kept its 18 400 km at the relist; 4 000 km more on this lease.
        reported: { condition: 'new', usage: { unit: 'km', value: 22_400 } },
        actor: 'cust-aino',
      },
      contract.endDate
    );
    if (!back.ok) throw new Error(back.reason.code);
    expect(await getAsset(db, 'ebike-007')).toMatchObject({
      status: 'returned',
      condition: 'fair',
      usage: { unit: 'km', value: 22_400 },
    });
  });

  it('a usage below the one at signing is refused', async () => {
    await assessAsset(db, { assetId: 'ebike-008', actor: 'admin', today: '2026-11-06' });
    const trip = {
      customerId: 'cust-aino',
      assetId: 'ebike-008',
      termMonths: 12,
      quoteOn: '2026-11-06',
    };
    const { contract } = await signedContract(db, trip);
    const leasedAt = (await getAsset(db, 'ebike-008'))!.usage.value;
    expect(leasedAt).toBeGreaterThan(0);
    const back = await exitContract(
      db,
      {
        contractId: contract.id,
        mode: 'return',
        reported: { condition: 'good', usage: { unit: 'km', value: 0 } },
        actor: 'cust-aino',
      },
      '2027-03-06'
    );
    expect(back).toEqual({
      ok: false,
      reason: {
        code: 'usage_below_signing',
        params: { value: 0, atSigning: leasedAt, unit: 'km' },
      },
    });
  });
});

describe("the assessment decides on the admin's inspection", () => {
  it('ebike-007 inspected poor with 25 000 km: assessed and relisted from poor, not the stored fair', async () => {
    const result = await assessAsset(db, {
      assetId: 'ebike-007',
      actor: 'admin',
      today: '2026-11-06',
      inspected: { condition: 'poor', usageValue: 25_000 },
    });
    if (!result.ok) throw new Error(result.reason.code);
    expect(result.view.input).toMatchObject({
      condition: 'poor',
      usage: { unit: 'km', value: 25_000 },
    });
    const row = await db.returnAssessment.findFirstOrThrow({ where: { asset_id: 'ebike-007' } });
    expect(row).toMatchObject({ condition: 'poor', usage_value: 25_000 });
  });

  it('without an inspection the stored (reported) values are assessed, as before', async () => {
    const result = await assessAsset(db, {
      assetId: 'ebike-007',
      actor: 'admin',
      today: '2026-11-06',
    });
    if (!result.ok) throw new Error(result.reason.code);
    expect(result.view.input).toMatchObject({ condition: 'fair', usage: { value: 18_400 } });
  });
});
