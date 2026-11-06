// Scenario card 10: ebike-008 already had two lives. Its passport shows the CO2 its current
// life avoids (worked by hand from the data files below), and once the returns desk gives it
// a third life the refurbishment — with that life's CO2 — appears on the timeline.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  loadAssets,
  loadCo2Factors,
  loadPriceLists,
  loadResidualCurves,
  loadSecondLifeDemand,
} from '@/data/load';
import { listPriceOn } from '@/domain/price-list';
import { ageInMonths, marketValueCents } from '@/domain/residual';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import { assetPassport } from './passport';
import { executeSecondLife } from './second-life';
import { seedWaitlist } from './waitlist';

let db: Awaited<ReturnType<typeof createTestDb>>['db'];
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  await seedAssets(db, await loadAssets());
  await seedWaitlist(db, await loadSecondLifeDemand());
});
afterAll(async () => {
  await cleanup();
});

const AS_OF = '2026-11-05';

describe('assetPassport', () => {
  it('returns null for an unknown asset', async () => {
    expect(await assetPassport(db, 'no-such-asset', AS_OF)).toBeNull();
  });

  it('card 10: ebike-008 is in its third life and its CO2 follows the formula', async () => {
    const passport = await assetPassport(db, 'ebike-008', AS_OF);
    if (!passport) throw new Error('missing passport');
    expect(passport.currentLife).toBe(3);
    expect(passport.events).toEqual([]);
    expect(passport.recordedLives).toEqual([]);

    const v1 = listPriceOn(await loadPriceLists(), 'ebike-008', '2026-01-01');
    if (!v1.ok) throw new Error(v1.reason);
    const value = marketValueCents(
      {
        originalListPriceCents: v1.priceCents,
        category: 'e_bike',
        condition: 'good',
        usageValue: 9800,
        ageMonths: ageInMonths(2022, AS_OF),
      },
      await loadResidualCurves()
    );
    const factors = await loadCo2Factors();
    const expected = 165 * (1 - factors.refurbishment_share_of_new) * (value / v1.priceCents);

    expect(passport.co2).toMatchObject({
      marketValueCents: value,
      originalListPriceCents: v1.priceCents,
      manufacturingNewKg: 165,
      refurbishmentShareOfNew: 0.12,
    });
    expect(passport.co2!.kg).toBeGreaterThan(0);
    expect(passport.co2!.kg).toBeCloseTo(expected, 1);
  });

  it('shows the refurbishment of the next life, with its CO2, after the desk executes it', async () => {
    const executed = await executeSecondLife(db, {
      assetId: 'ebike-008',
      actor: 'staff-desk',
      asOf: AS_OF,
    });
    if (!executed.ok) throw new Error(executed.reason);

    const passport = await assetPassport(db, 'ebike-008', AS_OF);
    if (!passport) throw new Error('missing passport');
    expect(passport.currentLife).toBe(4);
    expect(passport.events[0]).toMatchObject({ type: 'refurbished', onDate: AS_OF });
    expect(passport.recordedLives).toEqual([
      { life: 3, onDate: AS_OF, co2AvoidedKg: executed.co2AvoidedKg },
    ]);
  });
});
