import { beforeAll, describe, expect, it } from 'vitest';
import { loadCo2Factors } from '@/data/load';
import type { Co2Factors } from '@/data/schemas';
import { co2AvoidedKg } from './co2';

let factors: Co2Factors;
beforeAll(async () => {
  factors = await loadCo2Factors();
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
