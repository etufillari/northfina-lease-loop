import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadRefurbishmentCosts, loadSecondLifeDemand } from '@/data/load';
import type { AssetCondition, RefurbishmentCosts, SecondLifeRequest } from '@/data/schemas';
import type { ReturnedItem } from './refurbishment';
import { inSignupOrder, matchWaitingList, type MatchInput, type RentFor } from './waiting-list';

let costs: RefurbishmentCosts;
let demand: SecondLifeRequest[];
beforeAll(async () => {
  [costs, demand] = await Promise.all([loadRefurbishmentCosts(), loadSecondLifeDemand()]);
});
const entry = (id: string) => {
  const found = demand.find((request) => request.id === id);
  if (!found) throw new Error(`no ${id} in the data pack`);
  return found;
};

/** A rent table for tests: throws on any (condition, term) the test did not expect. */
const rentTable =
  (table: Record<string, number | null>): RentFor =>
  (condition, termMonths) => {
    const rent = table[`${condition}/${termMonths}`];
    if (rent === undefined) throw new Error(`unexpected rent lookup ${condition}/${termMonths}`);
    return rent;
  };

// Card 9: ebike-007, Nordvolt Cargo Duo (2023), back in fair condition with 18 400 km.
const ebike007: ReturnedItem = {
  category: 'e_bike',
  condition: 'fair',
  usage: { unit: 'km', value: 18_400 },
};

// Card 9 rents, worked by hand with the provisional second-life valuation (#14 decides it):
// first-lease price = same model on price list v1 = 549 000; age 1 Jan 2023 → 6 Nov 2026 =
// 46 months → curve 40 − 9 × 10/12 = 32.5 %; 549 000 × 0.325 = 178 425. The new battery
// (18 400 ≥ 15 000 km) resets usage, so no usage deduction. Financed = market value, band A.
//   fair:     178 425 × 0.65 = 115 976.25 → 115 976; 12 m × 0.056022 = 6 497.21 → 6 497
//   good:     178 425 × 0.85 = 151 661.25 → 151 661; 24 m × 0.036637 = 5 556.40 → 5 556
//                                                    12 m × 0.056022 = 8 496.35 → 8 496
//   like_new: 178 425 × 0.95 = 169 503.75 → 169 504; 36 m × 0.028625 = 4 852.05 → 4 852
const card9Rents = rentTable({
  'fair/12': 6_497,
  'good/24': 5_556,
  'good/12': 8_496,
  'like_new/36': 4_852,
});

describe('matchWaitingList: card 9', () => {
  const card9 = (): MatchInput => ({
    item: ebike007,
    availableOn: '2026-11-06',
    entries: inSignupOrder(demand),
    costs,
    rentFor: card9Rents,
  });

  it('gives ebike-007 to wait-02 as it is (fair), at 6 497 a month for 12 months', () => {
    const [winner] = matchWaitingList(card9()).ranked;
    expect(winner).toMatchObject({
      rank: 1,
      requestId: 'wait-02',
      termMonths: 12,
      monthlyRentCents: 6_497,
      winsOverNextBy: 'refurbishment_cost',
    });
    // Refurbish: yes, but only what the item needs: battery 35 000 + inspection 4 500.
    expect(winner?.plan).toMatchObject({ totalCents: 39_500, upgradeCents: 0 });
    expect(winner?.plan.conditionAfter).toBe('fair');
  });

  it('ranks wait-13 second: same budget and deadline, but needs a 12 000 fair->good upgrade', () => {
    const { ranked } = matchWaitingList(card9());
    // Totals: wait-02 39 500; wait-13 and wait-04 51 500 (+ fair->good 12 000);
    // wait-03 59 500 (+ 12 000 + good->like_new 8 000).
    expect(ranked.map((m) => [m.requestId, m.plan.totalCents, m.winsOverNextBy])).toEqual([
      ['wait-02', 39_500, 'refurbishment_cost'],
      ['wait-13', 51_500, 'needed_by'], // 2026-11-10 before wait-04's 2027-01-05
      ['wait-04', 51_500, 'refurbishment_cost'],
      ['wait-03', 59_500, null],
    ]);
    expect(ranked[1]).toMatchObject({ monthlyRentCents: 5_556, termMonths: 24 });
  });

  it('says why everyone else is left out', () => {
    const { excluded } = matchWaitingList(card9());
    const byId = Object.fromEntries(excluded.map((e) => [e.requestId, e]));
    // wait-01: good for 24 m is 5 556 > 4 500. wait-05: good for 12 m is 8 496 > 3 500.
    expect(byId['wait-01']).toEqual({
      requestId: 'wait-01',
      reasons: ['over_budget'],
      monthlyRentCents: 5_556,
    });
    expect(byId['wait-05']?.reasons).toEqual(['over_budget']);
    // The 5 laptop and 3 farm entries ask for another category.
    const otherCategory = excluded.filter((e) => e.reasons.includes('category_mismatch'));
    expect(otherCategory.map((e) => e.requestId).sort()).toEqual([
      'wait-06',
      'wait-07',
      'wait-08',
      'wait-09',
      'wait-10',
      'wait-11',
      'wait-12',
      'wait-14',
    ]);
    expect(excluded).toHaveLength(14 - 4);
  });
});

describe('matchWaitingList: eligibility edges', () => {
  const one = (
    request: Partial<SecondLifeRequest>,
    options: { availableOn?: string; rent?: number | null; item?: ReturnedItem } = {}
  ) =>
    matchWaitingList({
      item: options.item ?? ebike007,
      availableOn: options.availableOn ?? '2026-11-06',
      entries: inSignupOrder([{ ...entry('wait-02'), ...request }]),
      costs,
      rentFor: () => (options.rent === undefined ? 9_000 : options.rent),
    });

  it('accepts a rent exactly at the budget and refuses one cent over', () => {
    expect(one({}, { rent: 9_000 }).ranked).toHaveLength(1); // wait-02 budget 9 000
    expect(one({}, { rent: 9_001 }).excluded[0]?.reasons).toEqual(['over_budget']);
  });

  it('accepts an item ready on the deadline day and refuses one ready the day after', () => {
    expect(one({}, { availableOn: '2026-11-10' }).ranked).toHaveLength(1);
    expect(one({}, { availableOn: '2026-11-11' }).excluded[0]?.reasons).toEqual([
      'deadline_passed',
    ]);
  });

  it('upgrades an item one step below the minimum instead of excluding the entry', () => {
    const [match] = one({ min_condition: 'good' }).ranked;
    expect(match?.plan.upgradeCents).toBe(12_000); // fair->good
    expect(match?.plan.conditionAfter).toBe('good');
  });

  it('excludes an entry whose minimum the data cannot reach (no like_new->new step)', () => {
    expect(one({ min_condition: 'new' }).excluded[0]).toEqual({
      requestId: 'wait-02',
      reasons: ['condition_unreachable'],
      monthlyRentCents: null,
    });
  });

  it('excludes an entry the item cannot be priced for', () => {
    expect(one({}, { rent: null }).excluded[0]?.reasons).toEqual(['no_price']);
  });

  it('lists every reason that applies, not just the first', () => {
    expect(one({}, { availableOn: '2026-12-01', rent: 9_500 }).excluded[0]?.reasons).toEqual([
      'deadline_passed',
      'over_budget',
    ]);
  });

  it('returns nobody when nobody fits', () => {
    const result = one({}, { rent: 20_000 });
    expect(result.ranked).toEqual([]);
    expect(result.excluded).toHaveLength(1);
  });
});

describe('matchWaitingList: tie-breaks', () => {
  // laptop-006: good, 310 cycles. The plan is a 2 500 data wipe only (no battery under 500).
  const laptop006: ReturnedItem = {
    category: 'laptop',
    condition: 'good',
    usage: { unit: 'battery_cycles', value: 310 },
  };

  it('wait-06 beats wait-14: identical needs, wait-06 signed up first (list order)', () => {
    const run = (requests: SecondLifeRequest[], signupOrders: number[]) =>
      matchWaitingList({
        item: laptop006,
        availableOn: '2026-11-06',
        entries: requests.map((request, i) => ({ request, signupOrder: signupOrders[i] ?? 0 })),
        costs,
        rentFor: rentTable({ 'good/24': 2_000 }), // any rent within both budgets of 2 500
      }).ranked.map((m) => [m.requestId, m.winsOverNextBy]);
    const expected = [
      ['wait-06', 'signup_order'],
      ['wait-14', null],
    ];
    // Positions 6 and 14 in second-life-demand.json, given in either order.
    expect(run([entry('wait-06'), entry('wait-14')], [6, 14])).toEqual(expected);
    expect(run([entry('wait-14'), entry('wait-06')], [14, 6])).toEqual(expected);
  });

  it('falls back to the request id when everything else is equal', () => {
    const twin = { ...entry('wait-06') };
    const { ranked } = matchWaitingList({
      item: laptop006,
      availableOn: '2026-11-06',
      entries: [
        { request: { ...twin, id: 'wait-b' }, signupOrder: 1 },
        { request: { ...twin, id: 'wait-a' }, signupOrder: 1 },
      ],
      costs,
      rentFor: () => 2_000,
    });
    expect(ranked.map((m) => [m.rank, m.requestId, m.winsOverNextBy])).toEqual([
      [1, 'wait-a', 'request_id'],
      [2, 'wait-b', null],
    ]);
  });

  it('inSignupOrder numbers entries by their place in the list, from 1', () => {
    expect(inSignupOrder(demand.slice(0, 2)).map((e) => e.signupOrder)).toEqual([1, 2]);
  });
});

describe('matchWaitingList properties', () => {
  const conditions: AssetCondition[] = ['poor', 'fair', 'good', 'like_new', 'new'];
  const anyEntry = fc.record({
    request: fc.record({
      id: fc.string({ minLength: 1, maxLength: 4 }),
      category: fc.constantFrom('e_bike' as const, 'laptop' as const),
      max_monthly_net_rent_cents: fc.integer({ min: 0, max: 10_000 }),
      min_condition: fc.constantFrom(...conditions),
      preferred_term_months: fc.constantFrom(12, 24, 36, 48),
      needed_by: fc.constantFrom('2026-11-05', '2026-11-06', '2026-11-10'),
      who: fc.constant(''),
    }),
    // Few distinct values, so ties on every key are common.
    signupOrder: fc.integer({ min: 1, max: 3 }),
  });
  const entriesAndShuffle = fc
    .uniqueArray(anyEntry, { selector: (e) => e.request.id, maxLength: 12 })
    .chain((entries) =>
      fc.tuple(
        fc.constant(entries),
        fc.shuffledSubarray(entries, { minLength: entries.length, maxLength: entries.length })
      )
    );
  // Any fixed rule that gives better conditions and shorter terms a higher rent.
  const rentFor: RentFor = (condition, term) =>
    (conditions.indexOf(condition) + 1) * 1_000 + 600 - term * 10;
  const run = (entries: MatchInput['entries']) =>
    matchWaitingList({ item: ebike007, availableOn: '2026-11-06', entries, costs, rentFor });

  it('is a deterministic total order: input order never changes the result', () => {
    fc.assert(
      fc.property(entriesAndShuffle, ([entries, shuffled]) => {
        expect(run(shuffled)).toEqual(run(entries));
      })
    );
  });

  it('places every entry exactly once, ranks 1..n, each strictly ahead of the next', () => {
    fc.assert(
      fc.property(entriesAndShuffle, ([entries]) => {
        const { ranked, excluded } = run(entries);
        const ids = [...ranked, ...excluded].map((e) => e.requestId).sort();
        expect(ids).toEqual(entries.map((e) => e.request.id).sort());
        ranked.forEach((match, i) => {
          expect(match.rank).toBe(i + 1);
          expect(match.winsOverNextBy === null).toBe(i === ranked.length - 1);
        });
        expect(excluded.every((e) => e.reasons.length > 0)).toBe(true);
      })
    );
  });
});
