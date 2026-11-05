import { beforeAll, describe, expect, it } from 'vitest';
import { loadResidualCurves } from '@/data/load';
import type { ResidualCurves } from '@/data/schemas';
import { ageInMonths, curvePercentAt, marketValueCents, usageAdjustmentPercent } from './residual';

let curves: ResidualCurves;
beforeAll(async () => {
  curves = await loadResidualCurves();
});

describe('ageInMonths', () => {
  it('counts from 1 January of the model year', () => {
    expect(ageInMonths(2023, '2026-11-05')).toBe(46);
    expect(ageInMonths(2026, '2026-01-15')).toBe(0);
    expect(ageInMonths(2026, '2026-12-01')).toBe(11);
  });

  it('never goes negative for a future model year', () => {
    expect(ageInMonths(2027, '2026-11-05')).toBe(0);
  });
});

describe('curvePercentAt', () => {
  it('hits the curve points exactly', () => {
    const points = curves.curves.e_bike!;
    expect(curvePercentAt(points, 0)).toBe(100);
    expect(curvePercentAt(points, 36)).toBe(40);
  });

  it('interpolates linearly between points', () => {
    const points = curves.curves.e_bike!; // 36 → 40 %, 48 → 31 %
    expect(curvePercentAt(points, 46)).toBeCloseTo(32.5, 5);
    expect(curvePercentAt(points, 9)).toBeCloseTo(76, 5); // 6 → 82, 12 → 70
  });

  it('holds the last value beyond the curve', () => {
    const points = curves.curves.e_bike!; // ends at 60 → 25 %
    expect(curvePercentAt(points, 120)).toBe(25);
  });
});

describe('usageAdjustmentPercent', () => {
  it('counts whole steps only', () => {
    expect(usageAdjustmentPercent(curves, 'e_bike', 999)).toBe(0);
    expect(usageAdjustmentPercent(curves, 'e_bike', 1_500)).toBe(-2);
  });

  it('caps at the category maximum', () => {
    // 18 400 km is 18 steps × −2 % = −36 %, capped at −20 %.
    expect(usageAdjustmentPercent(curves, 'e_bike', 18_400)).toBe(-20);
  });
});

describe('marketValueCents', () => {
  it('multiplies curve, condition and usage, rounding half-up once at the end', () => {
    // 250 000 × 32.5 % (46 months) × 0.65 (fair) × 1.0 (no usage) = 52 812.5 → 52 813.
    expect(
      marketValueCents(
        {
          originalListPriceCents: 250_000,
          category: 'e_bike',
          condition: 'fair',
          usageValue: 0,
          ageMonths: 46,
        },
        curves
      )
    ).toBe(52_813);
  });

  it('a heavily used bike is worth the capped 20 % less', () => {
    const fresh = marketValueCents(
      {
        originalListPriceCents: 250_000,
        category: 'e_bike',
        condition: 'fair',
        usageValue: 0,
        ageMonths: 46,
      },
      curves
    );
    const worn = marketValueCents(
      {
        originalListPriceCents: 250_000,
        category: 'e_bike',
        condition: 'fair',
        usageValue: 18_400,
        ageMonths: 46,
      },
      curves
    );
    expect(worn).toBe(Math.floor(fresh * 0.8 + 0.5));
  });
});
