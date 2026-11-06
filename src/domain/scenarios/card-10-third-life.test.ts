// Card 10, third life: `ebike-008` has had two lives and is leased again. The passport shows
// the two counted past lives and the logged third, and the CO2 its later lives avoided is
// pro rata over the design life, from the lives the passport returns.
import { describe, expect, it } from 'vitest';
import { passportFor, type PassportEvent } from '../passport';
import { co2Method, co2SavedForAsset } from '../second-life/co2';
import { matchDemand } from '../second-life/match';
import { assessPackItem, assetById, pack, quoteFor } from './fixtures';

const ebike = assetById('ebike-008');
const thirdLife: PassportEvent[] = [
  {
    id: 1,
    kind: 'assessed',
    on_date: '2026-11-01',
    contract_id: null,
    details: { condition: 'good' },
  },
  { id: 2, kind: 'leased', on_date: '2026-11-05', contract_id: 'c-3', details: null },
  { id: 3, kind: 'returned', on_date: '2028-11-05', contract_id: 'c-3', details: null },
];

describe('card 10: third life (ebike-008, two lives, good, 9 800 km)', () => {
  it('is returned in good condition at 9 800 km after two lives, and can be priced again', () => {
    expect(ebike).toMatchObject({
      condition: 'good',
      usage: { unit: 'km', value: 9_800 },
      previous_lives: 2,
      status: 'returned',
    });
    const q = quoteFor({ assetId: 'ebike-008', termMonths: 24, isoDate: '2026-11-05' });
    expect(q.ok && q.quote.unitListPriceCents).toBe(179_900);
  });

  it('is relisted good at its market value 32 601 (D86) and leased for 24 months at 1 194', () => {
    const assessed = assessPackItem('ebike-008', '2026-11-06');
    const match = matchDemand(assessed, pack.demand);
    // 179 900 × 26 % × 0.85 × 82 % = 32 601; the 4 500 inspection is the lessor's cost.
    expect(match.relist).toMatchObject({ condition: 'good', secondLifeFinancedCents: 32_601 });
    expect(match.winner?.demandId).toBe('wait-05');
    // 32 601 (band A) × 0.036637 = 1 194.40 → 1 194.
    expect(match.relist.rents.find((r) => r.termMonths === 24)?.monthlyNetCents).toBe(1_194);
    // Like new: +3 836 of value for +8 000 of work, not worth it.
    expect(assessed.options[1]?.comparison?.worthIt).toBe(false);
  });

  it('the passport has both past lives, undated and estimated, then the logged third life', () => {
    const passport = passportFor(ebike, thirdLife);
    expect(passport.lives.map((l) => [l.index, l.start, l.months, l.estimated, l.endKind])).toEqual(
      [
        [0, null, 24, true, null],
        [1, null, 24, true, null],
        [2, '2026-11-05', 24, false, 'returned'],
      ]
    );
    expect(passport.lives[1]?.between.map((e) => e.kind)).toEqual(['assessed']);
  });

  it('the pro-rata CO2 from the passport lives: [0, 29, 29] kg, 58 kg in all', () => {
    const passport = passportFor(ebike, thirdLife);
    const co2 = co2SavedForAsset(co2Method(pack.co2Factors), {
      category: passport.category,
      lives: passport.lives.map((l) => ({ months: l.months ?? 0 })),
    });
    expect(co2.perLifeKg).toEqual([0, 29, 29]);
    expect(co2.totalKg).toBe(58);
  });

  it('an open third life counts its months so far: 12 months by 5 Nov 2027, 14.52 → 15 kg on top', () => {
    const passport = passportFor(ebike, thirdLife.slice(0, 2), '2027-11-05');
    expect(passport.lives.at(-1)?.months).toBe(12);
    const co2 = co2SavedForAsset(co2Method(pack.co2Factors), {
      category: passport.category,
      lives: passport.lives.map((l) => ({ months: l.months ?? 0 })),
    });
    expect(co2.perLifeKg).toEqual([0, 29, 15]);
  });

  // The passport read on a database (both past lives, the third after the assessment, 58 kg) is
  // src/server/scenarios/card-10.test.ts; the demo run that lands on it, src/server/demo-cards.test.ts.
});
