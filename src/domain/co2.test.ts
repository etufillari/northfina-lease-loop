import { beforeAll, describe, expect, it } from 'vitest';
import { loadCo2Factors, loadResidualCurves } from '@/data/load';
import type { Co2Factors, ResidualCurves } from '@/data/schemas';
import { avoidedByExtraLife, remainingValueShare, sumAvoidedKg } from './co2';

let factors: Co2Factors;
let curves: ResidualCurves;
beforeAll(async () => {
  [factors, curves] = await Promise.all([loadCo2Factors(), loadResidualCurves()]);
});

// Hand calculations below use co2-factors.json (e-bike 165 kg, laptop 330 kg, farm 18 000 kg,
// refurbishment 12 %) and residual-curves.json. 1 − 0.12 = 0.88.

describe('remainingValueShare', () => {
  it('is 1 for a new item at age 0 with no usage', () => {
    expect(
      remainingValueShare(curves, {
        category: 'e_bike',
        ageMonths: 0,
        condition: 'new',
        usageValue: 0,
      })
    ).toBe(1);
  });

  it('card 10: ebike-008 at 58 months, good, 9 800 km', () => {
    // 58 months: 31 + (25 − 31) × 10/12 = 26 %; good 0.85; 9 full steps × −2 % = −18 %.
    // 0.26 × 0.85 × 0.82 = 0.18122
    const share = remainingValueShare(curves, {
      category: 'e_bike',
      ageMonths: 58,
      condition: 'good',
      usageValue: 9_800,
    });
    expect(share).toBeCloseTo(0.18122, 10);
  });

  it('caps the usage deduction like the market value does', () => {
    // 40 000 km would be −80 %, capped at −20 %: 1 × 1 × 0.80
    expect(
      remainingValueShare(curves, {
        category: 'e_bike',
        ageMonths: 0,
        condition: 'new',
        usageValue: 40_000,
      })
    ).toBeCloseTo(0.8, 10);
  });

  it('holds the last curve value beyond the curve', () => {
    // laptop at 120 months: 12 %, new, no usage
    expect(
      remainingValueShare(curves, {
        category: 'laptop',
        ageMonths: 120,
        condition: 'new',
        usageValue: 0,
      })
    ).toBeCloseTo(0.12, 10);
  });
});

describe('avoidedByExtraLife', () => {
  it('card 10: ebike-008 third life avoids 26 kg', () => {
    // 165 × 0.88 = 145.2 kg; × 0.18122 = 26.313 kg → 26 kg
    const avoided = avoidedByExtraLife(factors, curves, {
      category: 'e_bike',
      ageMonths: 58,
      condition: 'good',
      usageValue: 9_800,
    });
    expect(avoided.manufacturingKg).toBe(165);
    expect(avoided.refurbishmentShare).toBe(0.12);
    expect(avoided.valueShare).toBeCloseTo(0.18122, 10);
    expect(avoided.avoidedKg).toBe(26);
  });

  it('a new item counts the full hint formula: 165 × 0.88 = 145.2 → 145 kg', () => {
    const avoided = avoidedByExtraLife(factors, curves, {
      category: 'e_bike',
      ageMonths: 0,
      condition: 'new',
      usageValue: 0,
    });
    expect(avoided.avoidedKg).toBe(145);
  });

  it('a like-new laptop counts far more than a worn-out one', () => {
    // laptop-009 (2025, like_new, 45 cycles) at 22 months: 60 − 20 × 10/12 = 43.333 %;
    // 0 usage steps; 290.4 × 0.95 × 0.43333 = 119.548 → 120 kg
    const likeNew = avoidedByExtraLife(factors, curves, {
      category: 'laptop',
      ageMonths: 22,
      condition: 'like_new',
      usageValue: 45,
    });
    // laptop-007 (2023, fair, 780 cycles) at 46 months: 26 + (18 − 26) × 10/12 = 19.333 %;
    // 7 steps × −1.5 % = −10.5 %; 290.4 × 0.19333 × 0.65 × 0.895 = 32.662 → 33 kg
    const wornOut = avoidedByExtraLife(factors, curves, {
      category: 'laptop',
      ageMonths: 46,
      condition: 'fair',
      usageValue: 780,
    });
    expect(likeNew.avoidedKg).toBe(120);
    expect(wornOut.avoidedKg).toBe(33);
  });

  it('farm-005 (2021, good, 4 200 h) at 70 months avoids 4 923 kg', () => {
    // 52 + (38 − 52) × 10/36 = 48.111 %; good 0.85; 8 steps × −3 % = −24 %
    // 18 000 × 0.88 = 15 840; × 0.48111 × 0.85 × 0.76 = 4 923.04 → 4 923 kg
    const avoided = avoidedByExtraLife(factors, curves, {
      category: 'farm_machine',
      ageMonths: 70,
      condition: 'good',
      usageValue: 4_200,
    });
    expect(avoided.avoidedKg).toBe(4_923);
  });

  it('a poor item at the end of its curve still counts, but little', () => {
    // e-bike at 60 months, poor, 20 000 km: 0.25 × 0.40 × 0.80 = 0.08; 145.2 × 0.08 = 11.616 → 12
    const avoided = avoidedByExtraLife(factors, curves, {
      category: 'e_bike',
      ageMonths: 60,
      condition: 'poor',
      usageValue: 20_000,
    });
    expect(avoided.avoidedKg).toBe(12);
  });
});

describe('sumAvoidedKg', () => {
  it('adds the rounded per-life figures, so a total equals its lines', () => {
    expect(sumAvoidedKg([26, 120, 33])).toBe(179);
  });

  it('is 0 for no lives', () => {
    expect(sumAvoidedKg([])).toBe(0);
  });
});
