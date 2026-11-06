import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadCoefficientTable,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadSecondLifeDemand,
} from '@/data/load';
import type { SecondLifeRequest } from '@/data/schemas';
import { isWaitingListId, passOnMatches, passOnReadyOn, waitingListChoiceProblem } from './pass-on';
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
