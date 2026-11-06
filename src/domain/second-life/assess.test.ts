// assessReturn: the options of a returned item (stay as returned, or each higher condition),
// each with its plan, market value, D86 second-life price (the market value, nothing added), the
// refurbish-or-not comparison against the as-returned option, and the rent per allowed term.
import { describe, expect, it } from 'vitest';
import refurbishmentJson from '../../../data/refurbishment-costs.json';
import residualJson from '../../../data/residual-curves.json';
import { refurbishmentCostsSchema, residualCurvesSchema, type PriceList } from '@/data/schemas';
import { marketValueCents } from '../residual/market-value';
import { pricing } from '../scenarios/fixtures';
import {
  assessReturn,
  compareToAsReturned,
  firstLeaseListPriceCents,
  withSecondLifePrice,
  type AssessData,
  type AssessInput,
} from './assess';

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

describe('assessReturn (card 9: ebike-007, fair, 18 400 km)', () => {
  const result = assessReturn(ebike007, data);
  const option = (condition: string) => result.options.find((o) => o.condition === condition)!;

  it('ages the item by D11 (previous lives): 46 months from January 2023, 32.5 % on the curve', () => {
    expect(result.ageMonths).toBe(46);
    expect(option('fair').marketValue.curvePercent).toBe(32.5);
  });

  it('offers fair (as returned), good and like new, never a downgrade', () => {
    expect(result.options.map((o) => [o.condition, o.upgrade])).toEqual([
      ['fair', false],
      ['good', true],
      ['like_new', true],
    ]);
  });

  it('as returned: battery 35 000 + inspection 4 500, value with the new battery 115 976, price 115 976', () => {
    const fair = option('fair');
    expect(fair.plan.totalCents).toBe(39_500);
    // D83: the total stays on the odometer, the usage since the battery is 0.
    expect(fair.plan.usageAfter).toEqual({ unit: 'km', value: 18_400 });
    expect(fair.plan.usageSinceResetAfter).toEqual({ unit: 'km', value: 0 });
    // 549 000 × 32.5 % × 0.65 × 1.00 (0 km since the battery) = 115 976.25 → 115 976.
    expect(fair.marketValue.valueCents).toBe(115_976);
    expect(fair.marketValue.usageAdjustmentPercent).toBe(0);
    // D86: the price is the market value; the 39 500 of work is the lessor's cost.
    expect(fair.secondLifeFinancedCents).toBe(115_976);
    expect(fair.comparison).toBeNull();
  });

  it('to good: 51 500 of work, value 151 661, price 151 661 (band A)', () => {
    const good = option('good');
    expect(good.plan.totalCents).toBe(51_500);
    expect(good.marketValue.valueCents).toBe(151_661);
    expect(good.secondLifeFinancedCents).toBe(151_661);
  });

  it('like new: 59 500 of work, value 169 504, price 169 504 (band A)', () => {
    const likeNew = option('like_new');
    expect(likeNew.plan.totalCents).toBe(59_500);
    expect(likeNew.marketValue.valueCents).toBe(169_504);
    expect(likeNew.secondLifeFinancedCents).toBe(169_504);
  });

  it('refurbish or not (D86): the value gain over as returned against the extra cost', () => {
    // good: 151 661 − 115 976 = 35 685 of value for 51 500 − 39 500 = 12 000 more: worth it.
    expect(option('good').comparison).toEqual({
      valueGainCents: 35_685,
      extraCostCents: 12_000,
      netGainCents: 23_685,
      worthIt: true,
    });
    // like new: 169 504 − 115 976 = 53 528 for 59 500 − 39 500 = 20 000 more: worth it.
    expect(option('like_new').comparison).toEqual({
      valueGainCents: 53_528,
      extraCostCents: 20_000,
      netGainCents: 33_528,
      worthIt: true,
    });
  });

  it('prices every allowed term on the D86 amount with the normal band and factor', () => {
    // 115 976, band A: 12 months × 0.056022 = 6 497.20 → 6 497; 24: 4 249; 36: 3 320; 48: 2 778.
    expect(option('fair').rents.map((r) => [r.termMonths, r.monthlyNetCents])).toEqual([
      [12, 6_497],
      [24, 4_249],
      [36, 3_320],
      [48, 2_778],
    ]);
    // 151 661 is band A: 24 months × 0.036637 = 5 556.40 → 5 556.
    expect(option('good').rents.find((r) => r.termMonths === 24)?.monthlyNetCents).toBe(5_556);
    expect(option('good').rents.find((r) => r.termMonths === 24)?.band).toBe('A');
    // 169 504, band A: 36 months × 0.028625 = 4 852.05 → 4 852.
    expect(option('like_new').rents.find((r) => r.termMonths === 36)?.monthlyNetCents).toBe(4_852);
  });
});

// The organisers' answer of 6 Nov 2026 (10:35), D83: `resets_usage: true` resets the usage
// adjustment in the market value and the next-replacement trigger; the total usage never resets.
describe("the organisers' example: ebike-007, 18 400 km, fair, 46 months on 6 Nov 2026", () => {
  const result = assessReturn(ebike007, data);
  const option = (condition: string) => result.options.find((o) => o.condition === condition)!;

  it('before the battery: 549 000 × 32.5 % × 0.65 × 0.80 (the −20 % cap) = 92 781', () => {
    const before = marketValueCents(
      {
        listPriceCents: 549_000,
        category: 'e_bike',
        ageMonths: result.ageMonths,
        condition: 'fair',
        usage: { unit: 'km', value: 18_400 },
      },
      data.curves
    );
    expect(before.valueCents).toBe(92_781);
    expect(before.usageAdjustmentPercent).toBe(-20);
  });

  it('with a new battery (usage → 0): 549 000 × 32.5 % × 0.65 × 1.00 = 115 976', () => {
    expect(option('fair').marketValue.valueCents).toBe(115_976);
  });

  it('also fair → good: 549 000 × 32.5 % × 0.85 × 1.00 = 151 661', () => {
    expect(option('good').marketValue.valueCents).toBe(151_661);
  });

  it('the gain against the cost: +58 880 of value for 51 500 of work (35 000 + 12 000 + 4 500)', () => {
    expect(option('good').marketValue.valueCents - 92_781).toBe(58_880);
    expect(option('good').plan.totalCents).toBe(35_000 + 12_000 + 4_500);
  });

  it('battery replaced at 18 400 km, back at 30 000: no new battery, the 11 600 km since count', () => {
    const again = assessReturn(
      { ...ebike007, usage: { unit: 'km', value: 30_000 }, usageAtLastReset: 18_400 },
      data
    );
    const fair = again.options[0]!;
    expect(fair.plan.steps.map((s) => s.id)).toEqual(['safety_inspection']);
    expect(fair.plan.usageAfter.value).toBe(30_000);
    expect(fair.marketValue.usageSteps).toBe(11);
    // 11 steps of −2 % is −22 %, held at the −20 % cap: 92 781 again.
    expect(fair.marketValue.valueCents).toBe(92_781);
  });
});

describe('assessReturn on other data', () => {
  it('a cheaper cost table changes the comparison, never the value or the price (D86)', () => {
    const cheap = structuredClone(data.costs);
    cheap.e_bike.fixed = cheap.e_bike.fixed.map((f) => ({ ...f, cost_cents: 1_000 }));
    const result = assessReturn(ebike007, { ...data, costs: cheap });
    expect(result.options[0]!.plan.totalCents).toBe(2_000);
    expect(result.options[0]!.marketValue.valueCents).toBe(115_976);
    expect(result.options[0]!.secondLifeFinancedCents).toBe(115_976);
    // good: 2 000 + 12 000 of work, still 12 000 over as returned, for the same 35 685.
    expect(result.options[1]!.comparison).toMatchObject({
      extraCostCents: 12_000,
      netGainCents: 23_685,
    });
  });

  it('a first-life item is aged from its lease start (D31)', () => {
    const result = assessReturn(
      {
        ...ebike007,
        usage: { unit: 'km', value: 1_800 },
        age: { modelYear: 2026, previousLives: 0, leaseStart: '2025-11-06' },
      },
      data
    );
    expect(result.ageMonths).toBe(12);
    // No battery under 15 000 km: the usage stays and costs one 2 % step.
    expect(result.options[0]!.plan.totalCents).toBe(4_500);
    expect(result.options[0]!.marketValue.usageSteps).toBe(1);
  });

  it('an item worth too little to finance gets no rent, however much work it had (D86)', () => {
    // 39 500 of work no longer lifts a 211-cent item over band A's 30 000 minimum: the price is
    // the value alone.
    const result = assessReturn({ ...ebike007, newPriceCents: 1_000 }, data);
    expect(result.options[0]!.plan.totalCents).toBe(39_500);
    expect(result.options[0]!.rents[0]).toMatchObject({
      monthlyNetCents: null,
      refusal: 'below_minimum',
    });
  });

  it('an item returned like new has one option only', () => {
    const result = assessReturn({ ...ebike007, condition: 'like_new' }, data);
    expect(result.options.map((o) => o.condition)).toEqual(['like_new']);
  });

  it('a laptop is priced only on its allowed terms (D43: up to 36)', () => {
    const result = assessReturn(
      {
        assetId: 'laptop-001',
        category: 'laptop',
        condition: 'good',
        usage: { unit: 'battery_cycles', value: 120 },
        age: { modelYear: 2025, previousLives: 1, leaseStart: '2025-01-01' },
        newPriceCents: 119_900,
        isoDate: '2026-11-06',
      },
      data
    );
    expect(result.options[0]!.rents.map((r) => r.termMonths)).toEqual([12, 24, 36]);
  });
});

describe('compareToAsReturned (D86: refurbish or not)', () => {
  it('card 10, ebike-008 good: like new gains 3 836 for 8 000 more, not worth it', () => {
    const result = assessReturn(
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
    expect(result.options.map((o) => [o.condition, o.secondLifeFinancedCents])).toEqual([
      ['good', 32_601],
      ['like_new', 36_437],
    ]);
    // 36 437 − 32 601 = 3 836 of value; 12 500 − 4 500 = 8 000 of extra work.
    expect(result.options[1]!.comparison).toEqual({
      valueGainCents: 3_836,
      extraCostCents: 8_000,
      netGainCents: -4_164,
      worthIt: false,
    });
  });

  it('a gain equal to the extra cost is not worth the work (gain > cost), as the decision ties', () => {
    const base = { valueCents: 100, costCents: 10 };
    expect(compareToAsReturned(base, { valueCents: 150, costCents: 60 })).toEqual({
      valueGainCents: 50,
      extraCostCents: 50,
      netGainCents: 0,
      worthIt: false,
    });
    expect(compareToAsReturned(base, { valueCents: 151, costCents: 60 }).worthIt).toBe(true);
  });
});

describe('withSecondLifePrice', () => {
  it('replaces the asset price in every list and keeps the versions and other prices', () => {
    const lists = withSecondLifePrice(pricing, 'ebike-007', 115_976).priceLists;
    expect(lists.map((l) => [l.version, l.prices['ebike-007']])).toEqual([
      [1, 115_976],
      [2, 115_976],
    ]);
    expect(lists[0]!.prices['ebike-001']).toBe(pricing.priceLists[0]!.prices['ebike-001']);
    expect(pricing.priceLists[0]!.prices['ebike-007']).toBe(549_000);
  });

  it('leaves a list without the asset alone', () => {
    const lists: PriceList[] = [{ ...pricing.priceLists[0]!, prices: { 'x-1': 100 } }];
    const out = withSecondLifePrice({ ...pricing, priceLists: lists }, 'ebike-007', 1);
    expect(out.priceLists[0]!.prices).toEqual({ 'x-1': 100 });
  });
});

describe('firstLeaseListPriceCents (D60)', () => {
  it('takes the earliest price list that has the asset', () => {
    expect(firstLeaseListPriceCents(pricing.priceLists, 'ebike-007')).toBe(549_000);
    expect(firstLeaseListPriceCents([...pricing.priceLists].reverse(), 'ebike-008')).toBe(179_900);
  });

  it('is null for an asset no list has', () => {
    expect(firstLeaseListPriceCents(pricing.priceLists, 'nope')).toBeNull();
  });
});
