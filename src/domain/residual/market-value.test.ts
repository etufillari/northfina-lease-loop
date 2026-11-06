// The market value of a used item by data/residual-curves.json: net list price at the first
// lease × curve(age) × condition multiplier × usage adjustment, rounded half up once.
import { describe, expect, it } from 'vitest';
import residualCurvesJson from '../../../data/residual-curves.json';
import { residualCurvesSchema, type ResidualCurves } from '@/data/schemas';
import { ageInMonths, monthsBetween } from './age';
import { curvePercent, marketValueCents, usageAdjustment } from './market-value';

const curves = residualCurvesSchema.parse(residualCurvesJson);
const EBIKE_003_LIST = 389_000; // price list v1 on 2026-11-05 (card 1)
const km = (value: number) => ({ unit: 'km' as const, value });

describe('curvePercent', () => {
  it('reads a point exactly on the curve: an e-bike at 12 months is 70 %', () => {
    expect(curvePercent(curves.curves.e_bike!, 12)).toEqual({ numerator: 7000, denominator: 1 });
  });

  it('interpolates linearly between two points: 17 months is 62.5 %', () => {
    // 70 % at 12, 52 % at 24: 70 − 18 × 5 / 12 = 62.5
    const p = curvePercent(curves.curves.e_bike!, 17);
    expect(p.numerator / p.denominator).toBe(6250);
  });

  it('holds the last value beyond the last point: 72 months is still 25 %', () => {
    expect(curvePercent(curves.curves.e_bike!, 72)).toEqual({ numerator: 2500, denominator: 1 });
  });
});

describe('usageAdjustment (the file rule: percent per whole step, capped)', () => {
  it('counts whole steps only: 1 800 km is one step of −2 %', () => {
    expect(usageAdjustment(curves.usage_adjustment.e_bike!, km(1_800))).toMatchObject({
      steps: 1,
      basisPoints: -200,
    });
  });

  it('caps at max_total_percent: 18 400 km (card 9) is −20 %, not −36 %', () => {
    expect(usageAdjustment(curves.usage_adjustment.e_bike!, km(18_400)).basisPoints).toBe(-2000);
  });

  it('0 km since a new battery (D83) is 0 %, never −0 %', () => {
    expect(usageAdjustment(curves.usage_adjustment.e_bike!, km(0))).toEqual({
      steps: 0,
      basisPoints: 0,
    });
    expect(
      Object.is(usageAdjustment(curves.usage_adjustment.e_bike!, km(999)).basisPoints, 0)
    ).toBe(true);
  });

  it('a usage unit that is not the category unit is a bug and throws', () => {
    expect(() =>
      usageAdjustment(curves.usage_adjustment.e_bike!, { unit: 'engine_hours', value: 10 })
    ).toThrow(RangeError);
  });
});

describe('marketValueCents', () => {
  const base = {
    listPriceCents: EBIKE_003_LIST,
    category: 'e_bike' as const,
    condition: 'new' as const,
    usage: km(0),
  };

  it('on a curve point with a condition: 389 000 × 70 % × 0.85 = 231 455', () => {
    const v = marketValueCents({ ...base, ageMonths: 12, condition: 'good' }, curves);
    expect(v.valueCents).toBe(231_455);
    expect(v.conditionMultiplier).toBe(0.85);
  });

  it('between two points: 389 000 × 62.5 % = 243 125', () => {
    expect(marketValueCents({ ...base, ageMonths: 17 }, curves).valueCents).toBe(243_125);
  });

  it('beyond the last point: 389 000 × 25 % = 97 250', () => {
    expect(marketValueCents({ ...base, ageMonths: 100 }, curves).valueCents).toBe(97_250);
  });

  it('rounds half up once at the end: 3 c × 50 % is 1.5 c, so 2 c', () => {
    const half: ResidualCurves = {
      ...curves,
      curves: {
        ...curves.curves,
        e_bike: [
          [0, 100],
          [10, 50],
        ],
      },
    };
    expect(marketValueCents({ ...base, listPriceCents: 3, ageMonths: 10 }, half).valueCents).toBe(
      2
    );
  });

  it('card 8 by D11 (chosen against by D31): ebike-003 by its model year, age 17', () => {
    // What Aino reports is an assumption of this test: "good" after 7 months, 1 800 km.
    const ageMonths = ageInMonths(2026, '2027-06-04');
    expect(ageMonths).toBe(17);
    const v = marketValueCents({ ...base, ageMonths, condition: 'good', usage: km(1_800) }, curves);
    // 389 000 × 62.5 % × 0.85 × 0.98 = 202 523.125 → 202 523
    expect(v.valueCents).toBe(202_523);
    expect(v.curvePercent).toBe(62.5);
    expect(v.usageAdjustmentPercent).toBe(-2);
    // As new with no km it would be 243 125.
    expect(marketValueCents({ ...base, ageMonths }, curves).valueCents).toBe(243_125);
  });

  it("card 8 by D31 (provisional): 7 months from the lease start, the brief's 311 200", () => {
    // 389 000 × 80 % (82 at 6 months, 70 at 12: 82 − 2) × new × no usage = 311 200. D31 ages a
    // first-life item from its lease start (curveAgeInMonths); D11 would give 243 125 (above).
    const ageMonths = monthsBetween('2026-11-05', '2027-06-05');
    expect(ageMonths).toBe(7);
    expect(marketValueCents({ ...base, ageMonths }, curves).valueCents).toBe(311_200);
  });

  it('throws on a negative age or a list price that is not whole cents', () => {
    expect(() => marketValueCents({ ...base, ageMonths: -1 }, curves)).toThrow(RangeError);
    expect(() => marketValueCents({ ...base, listPriceCents: 1.5, ageMonths: 1 }, curves)).toThrow(
      RangeError
    );
  });
});
