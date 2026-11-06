import { beforeAll, describe, expect, it } from 'vitest';
import { loadCo2Factors, loadResidualCurves } from '@/data/load';
import type { Co2Factors, ResidualCurves } from '@/data/schemas';
import { co2AvoidedKg, UNRECORDED_PRIOR_LIFE_MONTHS, unrecordedLifeCo2Kg } from './co2';
import { marketValueCents } from './residual';

let factors: Co2Factors;
let curves: ResidualCurves;
beforeAll(async () => {
  factors = await loadCo2Factors();
  curves = await loadResidualCurves();
});

describe('co2AvoidedKg', () => {
  it('scales the avoided manufacturing CO2 by the remaining value', () => {
    // 165 kg × (1 − 0.12) × 0.5 = 72.6 kg for a half-worn e-bike.
    expect(co2AvoidedKg({ category: 'e_bike', remainingValueFraction: 0.5 }, factors)).toBeCloseTo(
      72.6,
      5
    );
  });

  it('a nearly worn-out item saves almost nothing', () => {
    const wornOut = co2AvoidedKg({ category: 'e_bike', remainingValueFraction: 0.05 }, factors);
    const fresh = co2AvoidedKg({ category: 'e_bike', remainingValueFraction: 0.9 }, factors);
    expect(wornOut).toBeLessThan(fresh / 10);
  });

  it('clamps the fraction to 0..1', () => {
    expect(co2AvoidedKg({ category: 'laptop', remainingValueFraction: 1.4 }, factors)).toBe(
      330 * 0.88
    );
    expect(co2AvoidedKg({ category: 'laptop', remainingValueFraction: -1 }, factors)).toBe(0);
  });
});

describe('unrecordedLifeCo2Kg', () => {
  const laptop = {
    category: 'laptop' as const,
    condition: 'like_new' as const,
    usageValue: 45,
    previousLives: 1,
    originalListPriceCents: 100_000,
  };

  it('prices an earlier life with no history as UNRECORDED_PRIOR_LIFE_MONTHS of age', () => {
    expect(UNRECORDED_PRIOR_LIFE_MONTHS).toBe(6);
    const value = marketValueCents(
      {
        originalListPriceCents: 100_000,
        category: 'laptop',
        condition: 'like_new',
        usageValue: 45,
        ageMonths: 6,
      },
      curves
    );
    const expected = Math.round(330 * 0.88 * (value / 100_000) * 10) / 10;
    expect(unrecordedLifeCo2Kg(laptop, curves, factors)).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it('a first life avoids nothing', () => {
    expect(unrecordedLifeCo2Kg({ ...laptop, previousLives: 0 }, curves, factors)).toBe(0);
  });

  it('no original price means no figure, not a division by zero', () => {
    expect(unrecordedLifeCo2Kg({ ...laptop, originalListPriceCents: 0 }, curves, factors)).toBe(0);
  });

  it('a worse condition saves less', () => {
    const fair = unrecordedLifeCo2Kg({ ...laptop, condition: 'fair' }, curves, factors);
    expect(fair).toBeLessThan(unrecordedLifeCo2Kg(laptop, curves, factors));
  });
});
