import { describe, expect, it } from 'vitest';
import type { ResidualCurves } from '@/data/schemas';
import { curvePercent, marketValue } from './market-value';

// The e-bike and laptop rows of data/residual-curves.json.
const testCurves: ResidualCurves = {
  how_to_use: 'test copy',
  curves: {
    e_bike: [
      [0, 100],
      [6, 82],
      [12, 70],
      [24, 52],
      [36, 40],
      [48, 31],
      [60, 25],
    ],
    laptop: [
      [0, 100],
      [6, 75],
      [12, 60],
      [24, 40],
      [36, 26],
      [48, 18],
      [60, 12],
    ],
    farm_machine: [
      [0, 100],
      [96, 38],
    ],
  },
  condition_multiplier: { new: 1, like_new: 0.95, good: 0.85, fair: 0.65, poor: 0.4 },
  usage_adjustment: {
    e_bike: { unit: 'km', percent_per_step: -2, step: 1000, max_total_percent: -20 },
    laptop: { unit: 'battery_cycles', percent_per_step: -1.5, step: 100, max_total_percent: -15 },
    farm_machine: { unit: 'engine_hours', percent_per_step: -3, step: 500, max_total_percent: -30 },
  },
};

describe('curvePercent', () => {
  it('reads the points exactly', () => {
    expect(curvePercent(testCurves.curves.e_bike, 0)).toBe(100);
    expect(curvePercent(testCurves.curves.e_bike, 36)).toBe(40);
  });

  it('interpolates linearly between points', () => {
    // Card 8, month 7: 82 + (70 − 82) × 1/6 = 80.
    expect(curvePercent(testCurves.curves.e_bike, 7)).toBeCloseTo(80, 9);
    // ebike-007 at 46 months: 40 + (31 − 40) × 10/12 = 32.5.
    expect(curvePercent(testCurves.curves.e_bike, 46)).toBeCloseTo(32.5, 9);
  });

  it('holds the last value beyond the last point', () => {
    expect(curvePercent(testCurves.curves.laptop, 70)).toBe(12);
  });

  it('refuses a negative or fractional age', () => {
    expect(() => curvePercent(testCurves.curves.laptop, -1)).toThrow(RangeError);
    expect(() => curvePercent(testCurves.curves.laptop, 1.5)).toThrow(RangeError);
  });
});

describe('marketValue', () => {
  it('values a new e-bike after 7 months at 80 % of its list price (card 8)', () => {
    // 389 000 × 80 % × 1.0 (new) × 1.0 (0 km) = 311 200.
    expect(
      marketValue(testCurves, {
        category: 'e_bike',
        listPriceCents: 389_000,
        ageMonths: 7,
        condition: 'new',
        usageValue: 0,
      })
    ).toBe(311_200);
  });

  it('applies condition and caps the usage adjustment (ebike-007)', () => {
    // 18 400 km = 18 full steps × −2 % = −36 %, capped at −20 %.
    // 549 000 × 32.5 % × 0.65 (fair) × 0.80 = 92 781.
    expect(
      marketValue(testCurves, {
        category: 'e_bike',
        listPriceCents: 549_000,
        ageMonths: 46,
        condition: 'fair',
        usageValue: 18_400,
      })
    ).toBe(92_781);
  });

  it('counts only full usage steps', () => {
    // 9 800 km = 9 full steps × −2 % = −18 %: 100 000 × 1.0 × 0.82 = 82 000.
    expect(
      marketValue(testCurves, {
        category: 'e_bike',
        listPriceCents: 100_000,
        ageMonths: 0,
        condition: 'new',
        usageValue: 9_800,
      })
    ).toBe(82_000);
  });

  it('rounds once, half up', () => {
    // 450 cycles = 4 full steps × −1.5 % = −6 %.
    // 119 900 × 26 % × 0.85 (good) × 0.94 = 24 908.026 → 24 908.
    expect(
      marketValue(testCurves, {
        category: 'laptop',
        listPriceCents: 119_900,
        ageMonths: 36,
        condition: 'good',
        usageValue: 450,
      })
    ).toBe(24_908);
  });
});
