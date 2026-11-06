import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadCoefficientTable,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadSecondLifeDemand,
} from '@/data/load';
import type { SecondLifeRequest } from '@/data/schemas';
import {
  handOverPlan,
  type HandOverPlanInput,
  isWaitingListId,
  passOnMatches,
  passOnReadyOn,
  waitingListChoiceProblem,
} from './pass-on';
import type { SecondLifeData, SecondLifeItem } from './second-life';

let data: SecondLifeData;
let demand: SecondLifeRequest[];
beforeAll(async () => {
  const [curves, costs, table, list] = await Promise.all([
    loadResidualCurves(),
    loadRefurbishmentCosts(),
    loadCoefficientTable(),
    loadSecondLifeDemand(),
  ]);
  data = { curves, costs, table };
  demand = list;
});

// ebike-007 (card 9) while still leased: delivered good with 15 000 km. At the handover the
// customer reports fair with 18 400 km, which is card 9's returned state.
const leasedEbike007: SecondLifeItem = {
  category: 'e_bike',
  modelYear: 2023,
  firstLeasedNewOn: null,
  condition: 'good',
  usage: { unit: 'km', value: 15_000 },
  firstLeasePriceCents: 549_000,
};
const card9Inspection = { condition: 'fair', usageValue: 18_400 } as const;

describe('passOnMatches', () => {
  it('ranks the waiting list for the inspected item, not the delivered one (card 9)', () => {
    const ranked = passOnMatches(data, demand, leasedEbike007, card9Inspection, '2026-11-06');
    // The card 9 hand table (D-032): wait-02 takes it as it is for 12 months at 64.97 €.
    expect(ranked.map((m) => [m.requestId, m.monthlyRentCents, m.termMonths])).toEqual([
      ['wait-02', 6_497, 12],
      ['wait-13', 5_556, 24],
      ['wait-04', 5_556, 24],
      ['wait-03', 4_852, 36],
    ]);
  });

  it('drops anyone whose deadline is before the item is ready', () => {
    // Ready 11 Nov: wait-02 and wait-13 needed it by 10 Nov. wait-04 (5 Jan 2027) and
    // wait-03 (15 Dec) still fit.
    const ids = passOnMatches(data, demand, leasedEbike007, card9Inspection, '2026-11-11').map(
      (m) => m.requestId
    );
    expect(ids).not.toContain('wait-02');
    expect(ids).not.toContain('wait-13');
    expect(ids).toEqual(expect.arrayContaining(['wait-04', 'wait-03']));
  });

  it('offers e-bike riders an e-bike only', () => {
    const ranked = passOnMatches(data, demand, leasedEbike007, card9Inspection, '2026-11-06');
    const laptopIds = demand.filter((r) => r.category !== 'e_bike').map((r) => r.id);
    expect(ranked.filter((m) => laptopIds.includes(m.requestId))).toEqual([]);
  });

  it('is empty for an empty waiting list', () => {
    expect(passOnMatches(data, [], leasedEbike007, card9Inspection, '2026-11-06')).toEqual([]);
  });
});

describe('passOnReadyOn', () => {
  it('is the handover day when that is still ahead', () => {
    expect(passOnReadyOn('2026-11-06', '2026-11-10')).toBe('2026-11-10');
  });

  it('is today when the handover day has passed (a late choice)', () => {
    expect(passOnReadyOn('2026-11-12', '2026-11-10')).toBe('2026-11-12');
  });
});

describe('isWaitingListId', () => {
  it('accepts waiting-list ids only', () => {
    expect(isWaitingListId('wait-02')).toBe(true);
    expect(isWaitingListId('wait-')).toBe(false);
    expect(isWaitingListId('cust-aino')).toBe(false);
    expect(isWaitingListId('wait-02@example.com')).toBe(false);
  });
});

describe('waitingListChoiceProblem', () => {
  const ranked = () => passOnMatches(data, demand, leasedEbike007, card9Inspection, '2026-11-06');

  it('accepts a ranked match', () => {
    expect(waitingListChoiceProblem(demand, ranked(), 'wait-04')).toBeNull();
  });

  it('refuses an id that is not on the list', () => {
    expect(waitingListChoiceProblem(demand, ranked(), 'wait-99')).toBe(
      'unknown_waiting_list_entry'
    );
  });

  it('refuses someone on the list the item does not fit', () => {
    // wait-01: budget 45 € a month, below every rent for this bike.
    expect(waitingListChoiceProblem(demand, ranked(), 'wait-01')).toBe('waiting_list_not_a_match');
  });
});

describe('handOverPlan (#65)', () => {
  // Fixtures carry only what the plan reads. Rents are made up; the rule is what's tested.
  const ranked = [
    { requestId: 'wait-04', termMonths: 24, plan: { conditionAfter: 'good' as const } },
    { requestId: 'wait-03', termMonths: 36, plan: { conditionAfter: 'fair' as const } },
  ];
  const options = [
    {
      target: 'fair' as const,
      rents: [
        { termMonths: 12, monthlyNetRentCents: 9_000 },
        { termMonths: 36, monthlyNetRentCents: 4_000 },
      ],
    },
    {
      target: 'good' as const,
      rents: [
        { termMonths: 12, monthlyNetRentCents: 11_000 },
        { termMonths: 24, monthlyNetRentCents: 6_000 },
      ],
    },
  ];
  const plan = (
    nextLessee: string,
    today = '2027-01-02',
    opts: HandOverPlanInput['options'] = options
  ) =>
    handOverPlan({
      nextLessee,
      contractTermMonths: 12,
      today,
      handoverDate: '2027-01-02',
      ranked,
      options: opts,
    });

  it('refuses before the handover day: contract 1 still runs until the day before', () => {
    expect(plan('wait-04', '2027-01-01')).toEqual({
      ok: false,
      reason: 'too_early',
      opensOn: '2027-01-02',
    });
  });

  it('gives a ranked waiting-list entry the condition and term it asked for', () => {
    // wait-04 needs good for 24 months: the good option's 24-month rent.
    expect(plan('wait-04')).toEqual({
      ok: true,
      target: 'good',
      termMonths: 24,
      monthlyNetRentCents: 6_000,
    });
  });

  it('is fine after the handover day too (a late hand-over)', () => {
    expect(plan('wait-03', '2027-01-20')).toMatchObject({
      ok: true,
      target: 'fair',
      termMonths: 36,
    });
  });

  it('refuses a waiting-list entry that no longer matches', () => {
    expect(plan('wait-02')).toEqual({ ok: false, reason: 'waiting_list_not_a_match' });
  });

  it('gives a persona or an email the first (cheapest) option and the ended contract’s term', () => {
    // options[0] is fair; the contract ran 12 months.
    const expected = { ok: true, target: 'fair', termMonths: 12, monthlyNetRentCents: 9_000 };
    expect(plan('cust-sanna')).toEqual(expected);
    expect(plan('friend@example.com')).toEqual(expected);
  });

  it('refuses when the chosen option has no rent for that term', () => {
    const unpriced = [
      { target: 'fair' as const, rents: [{ termMonths: 12, monthlyNetRentCents: null }] },
    ];
    expect(plan('cust-sanna', '2027-01-02', unpriced)).toEqual({ ok: false, reason: 'no_price' });
    // wait-04 asks for good, which isn't among the options.
    expect(plan('wait-04', '2027-01-02', unpriced)).toEqual({ ok: false, reason: 'no_price' });
  });

  it('refuses when there is nothing to list it at', () => {
    expect(plan('cust-sanna', '2027-01-02', [])).toEqual({ ok: false, reason: 'no_price' });
  });
});
