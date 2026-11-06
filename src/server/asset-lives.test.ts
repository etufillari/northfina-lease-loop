// listAssetsWithLives (review finding 3): the pages' life count moves with our contracts.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { payRents, signedContract } from '../../tests/helpers/journey';
import { seedPack } from '../../tests/helpers/invoice-fixture';
import { resetDb } from '../../tests/helpers/reset-db';
import { createTestDb } from '../../tests/helpers/test-db';
import { withProductionHandlers } from '../../tests/helpers/with-handlers';
import { listAssetsWithLives } from './asset-lives';
import { exitContract } from './exits';
import type { PrismaClient } from './prisma-client';
import { assessAsset } from './second-life';

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

const livesOf = async (id: string) =>
  (await listAssetsWithLives(db)).find((a) => a.id === id)?.previous_lives;

describe('listAssetsWithLives', () => {
  it("the pack's count before any contract: ebike-003 0, ebike-008 2", async () => {
    expect([await livesOf('ebike-003'), await livesOf('ebike-008')]).toEqual([0, 2]);
  });

  it('card 10: ebike-008 leased a third time is still 2 previous lives (life 3) while active', async () => {
    await assessAsset(db, { assetId: 'ebike-008', actor: 'admin', today: '2026-11-06' });
    const trip = {
      customerId: 'cust-olavi',
      assetId: 'ebike-008',
      termMonths: 24,
      quoteOn: '2026-11-06',
    };
    await signedContract(db, trip);
    expect(await livesOf('ebike-008')).toBe(2);
  });

  it('card 1 returned and relisted: ebike-003 has 1 previous life (no longer "Life 1 · New")', async () => {
    const aino = 'cust-aino';
    const trip = { customerId: aino, assetId: 'ebike-003', termMonths: 12, quoteOn: '2026-11-05' };
    const { contract } = await signedContract(db, trip);
    await payRents(db, contract.id, 12, aino);
    const back = await exitContract(
      db,
      {
        contractId: contract.id,
        mode: 'return',
        reported: { condition: 'good', usage: { unit: 'km', value: 3_000 } },
        actor: aino,
      },
      contract.endDate
    );
    if (!back.ok) throw new Error(back.reason.code);
    await assessAsset(db, { assetId: 'ebike-003', actor: 'admin', today: contract.endDate });
    expect(await livesOf('ebike-003')).toBe(1);
  });
});
