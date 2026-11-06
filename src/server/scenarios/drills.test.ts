// The surprise-scenario drill that needs the database (src/domain/scenarios/drills.test.ts has
// the pure ones): an item in every status through the quote. The quote reads the asset's status
// from its row, so only `available` is quoted and each other status is refused by name.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedPack } from '../../../tests/helpers/invoice-fixture';
import { resetDb } from '../../../tests/helpers/reset-db';
import { createTestDb } from '../../../tests/helpers/test-db';
import { withProductionHandlers } from '../../../tests/helpers/with-handlers';
import { assetStatusSchema } from '@/data/schemas';
import type { PrismaClient } from '../prisma-client';
import { createQuote } from '../quotes';

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

describe('drill: an item in every status through the quote', () => {
  it.each(assetStatusSchema.options)('ebike-003 %s', async (status) => {
    // Another visitor's lease, a reservation or a sale; the test writes the status directly.
    await db.asset.update({ where: { id: 'ebike-003' }, data: { status } });
    const quote = await createQuote(db, {
      assetId: 'ebike-003',
      termMonths: 36,
      downPaymentCents: 0,
      today: '2026-11-06',
      actor: 'cust-aino',
    });
    if (status === 'available') {
      expect(quote.ok).toBe(true);
    } else {
      expect(quote).toEqual({
        ok: false,
        reason: { code: 'asset_not_available', params: { assetId: 'ebike-003', status } },
      });
    }
  });
});
