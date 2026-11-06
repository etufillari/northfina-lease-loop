// matchDemand (D13, D61): who on the waiting list gets a returned item, at what condition and
// rent, every step named.
import { describe, expect, it } from 'vitest';
import refurbishmentJson from '../../../data/refurbishment-costs.json';
import residualJson from '../../../data/residual-curves.json';
import {
  refurbishmentCostsSchema,
  residualCurvesSchema,
  type SecondLifeRequest,
} from '@/data/schemas';
import { assessPackItem, pack, pricing } from '../scenarios/fixtures';
import { assessReturn, type AssessData, type AssessInput } from './assess';
import { matchDemand } from './match';

const data: AssessData = {
  curves: residualCurvesSchema.parse(residualJson),
  costs: refurbishmentCostsSchema.parse(refurbishmentJson),
  pricing,
};
const ebike007: AssessInput = {
  assetId: 'ebike-007',
  category: 'e_bike',
  condition: 'fair',
  usage: { unit: 'km', value: 18_400 },
  age: { modelYear: 2023, previousLives: 1, leaseStart: '2023-01-01' },
  newPriceCents: 549_000,
  isoDate: '2026-11-06',
};
const assessed = assessReturn(ebike007, data);

const entry = (over: Partial<SecondLifeRequest> & { id: string }): SecondLifeRequest => ({
  category: 'e_bike',
  max_monthly_net_rent_cents: 9_000,
  min_condition: 'fair',
  preferred_term_months: 12,
  needed_by: '2026-11-10',
  who: 'test',
  ...over,
});

describe('matchDemand on the pack (card 9)', () => {
  const match = matchDemand(assessed, pack.demand);
  const verdict = (id: string) => match.verdicts.find((v) => v.demandId === id)!;

  it('wait-02 is matched as returned: fair is enough, 6 497 a month for 12 months', () => {
    // D86: 115 976 (the market value, band A) × 0.056022 = 6 497.20 → 6 497.
    expect(verdict('wait-02').outcome).toEqual({
      code: 'candidate',
      params: {
        condition: 'fair',
        upgrade: false,
        termMonths: 12,
        monthlyNetCents: 6_497,
        maxMonthlyNetCents: 9_000,
        totalRentCents: 77_964,
      },
    });
  });

  it('wait-13 is matched only refurbished to good: 5 556 a month for 24 months', () => {
    // 151 661 (band A) × 0.036637 = 5 556.40 → 5 556.
    expect(verdict('wait-13').outcome).toEqual({
      code: 'candidate',
      params: {
        condition: 'good',
        upgrade: true,
        termMonths: 24,
        monthlyNetCents: 5_556,
        maxMonthlyNetCents: 9_000,
        totalRentCents: 133_344,
      },
    });
  });

  it('D86 brings wait-03 in: like new 169 504 × 0.028625 = 4 852 for 36 months, under 6 000', () => {
    expect(verdict('wait-03').outcome).toEqual({
      code: 'candidate',
      params: {
        condition: 'like_new',
        upgrade: true,
        termMonths: 36,
        monthlyNetCents: 4_852,
        maxMonthlyNetCents: 6_000,
        totalRentCents: 174_672,
      },
    });
  });

  it('names the failing step of every other entry', () => {
    expect(verdict('wait-01').outcome).toMatchObject({
      code: 'over_budget',
      params: { monthlyNetCents: 5_556, maxMonthlyNetCents: 4_500, shortCents: 1_056 },
    });
    // good for 12 months: 151 661 × 0.056022 = 8 496.35 → 8 496, 4 996 over wait-05's 3 500.
    expect(verdict('wait-05').outcome).toMatchObject({
      code: 'over_budget',
      params: { condition: 'good', termMonths: 12, monthlyNetCents: 8_496, shortCents: 4_996 },
    });
    expect(verdict('wait-06').outcome).toEqual({
      code: 'other_category',
      params: { category: 'laptop' },
    });
  });

  it('ranks wait-02 over wait-13 by the first step: no refurbishment beyond the mandatory', () => {
    expect(match.ranking.map((r) => [r.demandId, r.decidedBy])).toEqual([
      ['wait-02', null],
      ['wait-13', 'no_refurbishment'],
      ['wait-03', 'needed_by'],
      ['wait-04', 'needed_by'],
    ]);
    expect(match.winner?.demandId).toBe('wait-02');
  });

  it('decides not to refurbish beyond the mandatory steps: relisted fair at 115 976', () => {
    expect(match.decision).toEqual({
      code: 'relist_for_winner',
      params: { condition: 'fair', upgrade: false, demandId: 'wait-02' },
    });
    expect(match.relist.secondLifeFinancedCents).toBe(115_976);
  });

  it('without wait-02 the item is refurbished to good for wait-13 (earliest need)', () => {
    const match2 = matchDemand(
      assessed,
      pack.demand.filter((d) => d.id !== 'wait-02')
    );
    expect(match2.winner?.demandId).toBe('wait-13');
    expect(match2.ranking[1]).toMatchObject({ demandId: 'wait-03', decidedBy: 'needed_by' });
    expect(match2.decision.params).toMatchObject({ condition: 'good', upgrade: true });
  });
});

describe('matchDemand on other data', () => {
  it('no winner (D86): relisted at the largest net gain, like new (+33 528 against good +23 685)', () => {
    const match = matchDemand(
      assessed,
      pack.demand.filter((d) => d.category !== 'e_bike')
    );
    expect(match.winner).toBeNull();
    expect(match.ranking).toEqual([]);
    expect(match.decision).toEqual({
      code: 'relist_without_match',
      params: { condition: 'like_new', upgrade: true },
    });
    expect(match.relist.secondLifeFinancedCents).toBe(169_504);
  });

  it('no winner and no positive net gain: relisted as returned (card 10, good)', () => {
    const ebike008 = assessReturn(
      {
        assetId: 'ebike-008',
        category: 'e_bike',
        condition: 'good',
        usage: { unit: 'km', value: 9_800 },
        age: { modelYear: 2022, previousLives: 2, leaseStart: '2022-01-01' },
        newPriceCents: 179_900,
        isoDate: '2026-11-06',
      },
      data
    );
    // like new gains 3 836 for 8 000 more: −4 164, so it stays good.
    expect(matchDemand(ebike008, []).decision).toEqual({
      code: 'relist_without_match',
      params: { condition: 'good', upgrade: false },
    });
  });

  it('no winner: never relisted below good, the data note (D61), even when that costs more', () => {
    // Every condition worth the same: each upgrade only loses its cost.
    const curves = structuredClone(data.curves);
    curves.condition_multiplier = { poor: 0.65, fair: 0.65, good: 0.65, like_new: 0.65, new: 0.65 };
    const flat = assessReturn(ebike007, { ...data, curves });
    expect(flat.options[1]!.comparison).toMatchObject({ valueGainCents: 0, worthIt: false });
    const match = matchDemand(flat, []);
    // Good (−12 000) loses the least of the conditions the catalogue may lease; fair is out.
    expect(match.decision.params).toEqual({ condition: 'good', upgrade: true });
  });

  it('no winner: an option no term can price is skipped (laptop-006 good, 27 577 < 30 000)', () => {
    const laptop = assessPackItem('laptop-006', '2026-11-06');
    expect(laptop.options[0]!.rents.every((r) => r.monthlyNetCents === null)).toBe(true);
    // Like new loses 1 756 (3 244 of value for 5 000 more), but it is the one that can be leased.
    expect(matchDemand(laptop, []).relist).toMatchObject({
      condition: 'like_new',
      secondLifeFinancedCents: 30_821,
    });
  });

  it('no winner and no condition the catalogue can lease: refused, relist_unpriced', () => {
    const laptop = structuredClone(assessPackItem('laptop-006', '2026-11-06'));
    // Like new unpriced too: no option at or above good has a rent on any term.
    for (const option of laptop.options) {
      option.rents = option.rents.map((r) => ({ ...r, monthlyNetCents: null }));
    }
    const match = matchDemand(laptop, []);
    expect(match.decision).toEqual({
      code: 'relist_unpriced',
      params: { condition: 'like_new', upgrade: true },
    });
  });

  it('a winner is never refused: relist_unpriced only without a match', () => {
    const match = matchDemand(assessed, [entry({ id: 'w' })]);
    expect(match.decision.code).toBe('relist_for_winner');
  });

  it('a budget one cent short is out, by one cent', () => {
    const match = matchDemand(assessed, [entry({ id: 'a', max_monthly_net_rent_cents: 6_496 })]);
    expect(match.verdicts[0]!.outcome).toMatchObject({
      code: 'over_budget',
      params: { shortCents: 1 },
    });
    const exact = matchDemand(assessed, [entry({ id: 'a', max_monthly_net_rent_cents: 6_497 })]);
    expect(exact.winner?.demandId).toBe('a');
  });

  it('two entries equal on every step but id: the lower id wins, and the step says so', () => {
    const match = matchDemand(assessed, [entry({ id: 'w-b' }), entry({ id: 'w-a' })]);
    expect(match.ranking.map((r) => [r.demandId, r.decidedBy])).toEqual([
      ['w-a', null],
      ['w-b', 'id'],
    ]);
  });

  it('ids compare by their numbers: wait-14 before wait-100 (review finding 12)', () => {
    const match = matchDemand(assessed, [entry({ id: 'wait-100' }), entry({ id: 'wait-14' })]);
    expect(match.ranking.map((r) => r.demandId)).toEqual(['wait-14', 'wait-100']);
  });

  it('on equal need dates the higher total rent over the term wins', () => {
    const match = matchDemand(assessed, [
      entry({ id: 'w-a', preferred_term_months: 12 }),
      entry({ id: 'w-b', preferred_term_months: 24 }),
    ]);
    // 24 × 4 249 = 101 976 beats 12 × 6 497 = 77 964.
    expect(match.ranking.map((r) => [r.demandId, r.decidedBy])).toEqual([
      ['w-b', null],
      ['w-a', 'total_rent'],
    ]);
  });

  it('another demand list: the earliest need wins among the as-returned candidates', () => {
    const match = matchDemand(assessed, [
      entry({ id: 'w-a', needed_by: '2026-12-01' }),
      entry({ id: 'w-b', needed_by: '2026-11-20' }),
    ]);
    expect(match.winner?.demandId).toBe('w-b');
    expect(match.ranking[1]!.decidedBy).toBe('needed_by');
  });

  it('a term the category does not offer is named', () => {
    const match = matchDemand(assessed, [entry({ id: 'w', preferred_term_months: 60 })]);
    expect(match.verdicts[0]!.outcome).toEqual({
      code: 'term_not_offered',
      params: { termMonths: 60, terms: [12, 24, 36, 48] },
    });
  });

  it('a poor item is never relisted poor: a fair-accepting entry gets it refurbished to fair', () => {
    const poor = assessReturn({ ...ebike007, condition: 'poor' }, data);
    const match = matchDemand(poor, [
      entry({ id: 'w', min_condition: 'poor', max_monthly_net_rent_cents: 99_999 }),
    ]);
    expect(match.verdicts[0]!.outcome.params).toMatchObject({ condition: 'fair', upgrade: true });
    expect(match.relist.condition).toBe('fair');
  });
});

describe('matchDemand: who is still waiting (D62)', () => {
  it('an entry whose need date has passed is expired, not the earliest', () => {
    const later = assessReturn({ ...ebike007, isoDate: '2026-11-11' }, data);
    const match = matchDemand(later, pack.demand);
    expect(match.verdicts.find((v) => v.demandId === 'wait-02')!.outcome).toEqual({
      code: 'expired',
      params: { neededBy: '2026-11-10', isoDate: '2026-11-11' },
    });
    // wait-13 (same day) is expired too; D86 put wait-03 (like new, 4 852 ≤ 6 000, needed by
    // 2026-12-15) in budget, so it beats wait-04 (2027-01-05) on the need date.
    expect(match.winner?.demandId).toBe('wait-03');
    expect(match.ranking[1]).toMatchObject({ demandId: 'wait-04', decidedBy: 'needed_by' });
  });

  it('needed on the assessment day itself still counts', () => {
    const onTheDay = assessReturn({ ...ebike007, isoDate: '2026-11-10' }, data);
    expect(matchDemand(onTheDay, pack.demand).winner?.demandId).toBe('wait-02');
  });

  it('an entry an earlier assessment matched is not matched twice', () => {
    const match = matchDemand(assessed, pack.demand, ['wait-02']);
    expect(match.verdicts.find((v) => v.demandId === 'wait-02')!.outcome.code).toBe(
      'already_matched'
    );
    expect(match.winner?.demandId).toBe('wait-13');
  });
});

describe('card 10 on a later clock (D62)', () => {
  it('on 2026-11-09 wait-05 (needed by 11-08) is expired and wait-13 wins ebike-008', () => {
    const ebike008 = assessReturn(
      {
        assetId: 'ebike-008',
        category: 'e_bike',
        condition: 'good',
        usage: { unit: 'km', value: 9_800 },
        age: { modelYear: 2022, previousLives: 2, leaseStart: '2022-01-01' },
        newPriceCents: 179_900,
        isoDate: '2026-11-09',
      },
      data
    );
    const match = matchDemand(ebike008, pack.demand);
    expect(match.verdicts.find((v) => v.demandId === 'wait-05')!.outcome.code).toBe('expired');
    // wait-02 and wait-13 tie on the first two steps; 24 × 1 194 beats 12 × 1 826 (D86).
    expect(match.ranking.slice(0, 2).map((r) => [r.demandId, r.decidedBy])).toEqual([
      ['wait-13', null],
      ['wait-02', 'total_rent'],
    ]);
  });
});
