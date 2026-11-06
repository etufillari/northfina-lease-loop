import { describe, expect, it } from 'vitest';
import {
  loadAssets,
  loadResidualCurves,
  loadPriceLists,
  loadSecondLifeDemand,
  loadCoefficientTable,
  loadCo2Factors,
} from '@/data/load';
import { assetAgeMonths, residualValue, matchSecondLife, impactGrams } from './valuation';
import { planRefurbishment } from './refurbishment';
import { loadRefurbishmentCosts } from '@/data/load';
const assets = await loadAssets();
const rules = await loadResidualCurves();
const prices = await loadPriceLists();
const table = await loadCoefficientTable();
const demand = await loadSecondLifeDemand();
const factors = await loadCo2Factors();
const bike = assets.find((a) => a.id === 'ebike-007');
if (!bike) throw new Error('fixture');
describe('valuation, matching and impact', () => {
  it('interpolates age and bounds usage penalties without money floats', () => {
    expect(assetAgeMonths(2023, '2026-11-06')).toBe(46);
    expect(() => assetAgeMonths(2023, 'bad')).toThrow();
    expect(
      residualValue(
        { ...bike, condition: 'new', usage: { unit: 'km', value: 0 } },
        100000,
        0,
        rules
      )
    ).toBe(100000);
    expect(
      residualValue(
        { ...bike, condition: 'new', usage: { unit: 'km', value: 0 } },
        100000,
        3,
        rules
      )
    ).toBe(91000);
    expect(
      residualValue(
        { ...bike, condition: 'new', usage: { unit: 'km', value: 0 } },
        100000,
        200,
        rules
      )
    ).toBe(25000);
    expect(() => residualValue(bike, -1, 0, rules)).toThrow();
  });
  it('card9 explains refurbishment and deterministically ranks feasible demand', async () => {
    const plan = planRefurbishment(bike, await loadRefurbishmentCosts());
    const restored = {
      ...bike,
      condition: plan.resultingCondition,
      usage: { ...bike.usage, value: plan.resultingUsage },
    };
    const price = prices[0]?.prices[bike.id];
    if (price === undefined) throw new Error('fixture');
    const value = residualValue(restored, price, 46, rules);
    const matches = matchSecondLife(
      restored,
      value,
      demand.filter((r) => ['wait-02', 'wait-13'].includes(r.id)),
      table,
      '2026-11-06'
    );
    expect(matches.map((m) => m.requestId)).toEqual(['wait-02', 'wait-13']);
    expect(matchSecondLife(restored, value, [...demand].reverse(), table, '2026-11-06')).toEqual(
      matchSecondLife(restored, value, demand, table, '2026-11-06')
    );
    expect(matches[0]?.termMonths).toBe(12);
    expect(matchSecondLife(restored, value, demand, table, '2028-01-01')).toHaveLength(0);
    expect(() => matchSecondLife(restored, value, demand, table, 'bad')).toThrow();
  });
  it('labels fictional avoided manufacturing and weights worn assets conservatively', () => {
    expect(impactGrams({ ...bike, condition: 'good' }, 1, factors)).toBe(145200);
    expect(impactGrams({ ...bike, condition: 'fair' }, 1, factors)).toBe(72600);
    expect(impactGrams(bike, 0, factors)).toBe(0);
    expect(() => impactGrams(bike, -1, factors)).toThrow();
  });
});
