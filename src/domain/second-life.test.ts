import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadCoefficientTable,
  loadPriceLists,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadSecondLifeDemand,
} from '@/data/load';
import type { PriceList } from '@/data/schemas';
import { listPriceOn } from './price-list';
import {
  firstLeasePrice,
  relistTargets,
  secondLifeRentFor,
  valueSecondLife,
  withListedPrices,
  type SecondLifeData,
  type SecondLifeItem,
} from './second-life';
import { inSignupOrder, matchWaitingList } from './waiting-list';

let data: SecondLifeData;
let priceLists: PriceList[];
beforeAll(async () => {
  const [curves, costs, table, lists] = await Promise.all([
    loadResidualCurves(),
    loadRefurbishmentCosts(),
    loadCoefficientTable(),
    loadPriceLists(),
  ]);
  data = { curves, costs, table };
  priceLists = lists;
});

// Card 9: ebike-007, Nordvolt Cargo Duo (2023), back in fair condition with 18 400 km.
// First-lease price = its v1 price 549 000 (D-035).
const ebike007: SecondLifeItem = {
  category: 'e_bike',
  modelYear: 2023,
  firstLeasedNewOn: null, // used in the data pack: age from 1 Jan 2023 (D-042)
  condition: 'fair',
  usage: { unit: 'km', value: 18_400 },
  firstLeasePriceCents: 549_000,
};

// Card 10: ebike-008, Kettu Bikes Urban 1 (2022), good, 9 800 km, 2 lives behind it.
const ebike008: SecondLifeItem = {
  category: 'e_bike',
  modelYear: 2022,
  firstLeasedNewOn: null,
  condition: 'good',
  usage: { unit: 'km', value: 9_800 },
  firstLeasePriceCents: 179_900,
};

describe('firstLeasePrice', () => {
  it('uses the earliest price list, so the value does not jump with v2 (+5 %)', () => {
    expect(firstLeasePrice(priceLists, 'ebike-007')).toEqual({
      priceCents: 549_000,
      priceListVersion: 1,
    });
  });

  it('is null for an asset no price list knows', () => {
    expect(firstLeasePrice(priceLists, 'nope-001')).toBeNull();
  });
});

describe('valueSecondLife: card 9 (ebike-007 on 2026-11-06)', () => {
  it('kept fair: battery + inspection 39 500, value 115 976', () => {
    const valued = valueSecondLife(data, ebike007, 'fair', '2026-11-06');
    // Age 46 months: 40 + (31 − 40) × 10/12 = 32.5 %.
    // As returned: 549 000 × 0.325 × 0.65 (fair) × 0.80 (18 steps × −2 %, capped −20 %)
    //   = 92 781.00 → 92 781.
    // After: battery resets usage to 0 km: 549 000 × 0.325 × 0.65 × 1.00 = 115 976.25 → 115 976.
    expect(valued).toMatchObject({
      ok: true,
      ageMonths: 46,
      curvePercent: 32.5,
      asReturned: { conditionMultiplier: 0.65, usagePercent: -20, valueCents: 92_781 },
      after: {
        condition: 'fair',
        usageValue: 0,
        conditionMultiplier: 0.65,
        usagePercent: 0,
        valueCents: 115_976,
      },
      refurbishmentCents: 39_500,
      listPriceCents: 115_976,
    });
  });

  it('brought to good: 51 500 of work, value 151 661', () => {
    // 549 000 × 0.325 × 0.85 = 151 661.25 → 151 661.
    expect(valueSecondLife(data, ebike007, 'good', '2026-11-06')).toMatchObject({
      ok: true,
      refurbishmentCents: 51_500,
      listPriceCents: 151_661,
    });
  });

  it('brought to like new: 59 500 of work, value 169 504', () => {
    // 549 000 × 0.325 × 0.95 = 169 503.75 → 169 504.
    expect(valueSecondLife(data, ebike007, 'like_new', '2026-11-06')).toMatchObject({
      ok: true,
      refurbishmentCents: 59_500,
      listPriceCents: 169_504,
    });
  });

  it('cannot reach new: there is no like_new->new step', () => {
    expect(valueSecondLife(data, ebike007, 'new', '2026-11-06')).toEqual({
      ok: false,
      reason: 'condition_unreachable',
    });
  });
});

describe('valueSecondLife: card 10 (ebike-008 on 2026-11-06)', () => {
  it('stays good, only the 4 500 inspection; 9 800 km still counts as 9 full steps', () => {
    // Age 58 months: 31 + (25 − 31) × 10/12 = 26 %. No battery (9 800 < 15 000 km).
    // 179 900 × 0.26 × 0.85 × 0.82 = 32 601.478 → 32 601.
    expect(valueSecondLife(data, ebike008, 'good', '2026-11-06')).toMatchObject({
      ok: true,
      ageMonths: 58,
      after: { condition: 'good', usageValue: 9_800, usagePercent: -18, valueCents: 32_601 },
      refurbishmentCents: 4_500,
      listPriceCents: 32_601,
    });
  });
});

describe('secondLifeRentFor', () => {
  it("prices card 9 through the normal coefficient table, as D-032's hand table says", () => {
    const rentFor = secondLifeRentFor(data, ebike007, '2026-11-06');
    // Band A (30 000–199 999), no down payment:
    expect(rentFor('fair', 12)).toBe(6_497); // 115 976 × 0.056022 = 6 497.21
    expect(rentFor('fair', 36)).toBe(3_320); // 115 976 × 0.028625 = 3 319.81
    expect(rentFor('good', 24)).toBe(5_556); // 151 661 × 0.036637 = 5 556.40
    expect(rentFor('good', 12)).toBe(8_496); // 151 661 × 0.056022 = 8 496.35
    expect(rentFor('like_new', 36)).toBe(4_852); // 169 504 × 0.028625 = 4 852.05
  });

  it('prices card 10 for every term', () => {
    const rentFor = secondLifeRentFor(data, ebike008, '2026-11-06');
    expect(rentFor('good', 12)).toBe(1_826); // 32 601 × 0.056022 = 1 826.37
    expect(rentFor('good', 24)).toBe(1_194); // 32 601 × 0.036637 = 1 194.40
    expect(rentFor('good', 36)).toBe(933); // 32 601 × 0.028625 = 933.20
    expect(rentFor('good', 48)).toBe(781); // 32 601 × 0.023949 = 780.76
  });

  it('is null when the value is under the table minimum of 30 000, or the term is unknown', () => {
    // 2016 bike: age ≥ 60 → 25 %. 100 000 × 0.25 × 0.85 × 0.82 = 17 425 < 30 000.
    const old: SecondLifeItem = { ...ebike008, modelYear: 2016, firstLeasePriceCents: 100_000 };
    expect(secondLifeRentFor(data, old, '2026-11-06')('good', 12)).toBeNull();
    expect(secondLifeRentFor(data, ebike008, '2026-11-06')('good', 18)).toBeNull();
  });

  it('is null for a condition the item cannot reach', () => {
    expect(secondLifeRentFor(data, ebike007, '2026-11-06')('new', 12)).toBeNull();
  });
});

describe('card 9 end to end: the real valuation feeds the waiting list', () => {
  it('gives ebike-007 to wait-02 as it is, at 6 497 a month for 12 months; wait-13 second', async () => {
    const { ranked } = matchWaitingList({
      item: ebike007,
      availableOn: '2026-11-06',
      entries: inSignupOrder(await loadSecondLifeDemand()),
      costs: data.costs,
      rentFor: secondLifeRentFor(data, ebike007, '2026-11-06'),
    });
    // Same rents as the hand table in waiting-list.test.ts (D-032).
    expect(ranked.map((m) => [m.requestId, m.monthlyRentCents, m.termMonths])).toEqual([
      ['wait-02', 6_497, 12],
      ['wait-13', 5_556, 24],
      ['wait-04', 5_556, 24], // good, 24 m, same as wait-13
      ['wait-03', 4_852, 36],
    ]);
  });
});

describe('relistTargets', () => {
  it('offers good and like new for the open catalogue (data: good is the minimum)', () => {
    expect(relistTargets('fair', false)).toEqual(['good', 'like_new']);
    expect(relistTargets('poor', false)).toEqual(['good', 'like_new']);
  });

  it('adds fair only when a waiting-list entry accepts fair', () => {
    expect(relistTargets('fair', true)).toEqual(['fair', 'good', 'like_new']);
  });

  it('never offers a downgrade: a good item starts at good', () => {
    expect(relistTargets('good', true)).toEqual(['good', 'like_new']);
    expect(relistTargets('like_new', false)).toEqual(['like_new']);
    expect(relistTargets('new', false)).toEqual(['new']);
  });
});

describe('withListedPrices', () => {
  it('replaces a re-listed item price in every list and leaves the rest alone', () => {
    const lists = withListedPrices(priceLists, { 'ebike-007': 115_976 });
    expect(listPriceOn(lists, 'ebike-007', '2026-11-05')).toEqual({
      ok: true,
      priceCents: 115_976,
      priceListVersion: 1,
    });
    expect(listPriceOn(lists, 'ebike-007', '2026-11-06')).toMatchObject({ priceCents: 115_976 });
    expect(listPriceOn(lists, 'ebike-004', '2026-11-06')).toMatchObject({ priceCents: 576_400 });
  });

  it('does not change the lists it was given', () => {
    withListedPrices(priceLists, { 'ebike-007': 1 });
    expect(priceLists[0]?.prices['ebike-007']).toBe(549_000);
  });

  it('returns the same lists when nothing is re-listed', () => {
    expect(withListedPrices(priceLists, {})).toBe(priceLists);
  });
});
