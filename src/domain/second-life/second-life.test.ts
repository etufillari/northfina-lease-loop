import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadResidualCurves } from '@/data/load';
import type { CoefficientTable, ResidualCurves } from '@/data/schemas';
import {
  ageInMonths,
  curveBasisPoints,
  firstLease,
  marketValue,
  relistProblem,
  usageBasisPoints,
} from './second-life';

// Tests run against the real data pack, so they also catch a changed file.
let curves: ResidualCurves;
let table: CoefficientTable;
beforeAll(async () => {
  [curves, table] = await Promise.all([loadResidualCurves(), loadCoefficientTable()]);
});

describe('ageInMonths', () => {
  it('counts whole months only', () => {
    expect(ageInMonths('2026-01-15', '2026-02-14')).toBe(0);
    expect(ageInMonths('2026-01-15', '2026-02-15')).toBe(1);
    expect(ageInMonths('2022-03-07', '2026-11-05')).toBe(55);
  });

  it('crosses years', () => {
    expect(ageInMonths('2025-12-01', '2026-01-01')).toBe(1);
  });

  it('is zero on the same day and for a date before the start', () => {
    expect(ageInMonths('2026-01-15', '2026-01-15')).toBe(0);
    expect(ageInMonths('2026-01-15', '2025-01-15')).toBe(0);
  });
});

describe('curveBasisPoints', () => {
  it('reads a point on the curve exactly', () => {
    expect(curveBasisPoints(curves.curves.e_bike, 0)).toBe(10_000);
    expect(curveBasisPoints(curves.curves.e_bike, 12)).toBe(7_000);
    expect(curveBasisPoints(curves.curves.e_bike, 60)).toBe(2_500);
  });

  it('draws a straight line between points', () => {
    expect(curveBasisPoints(curves.curves.e_bike, 18)).toBe(6_100);
    expect(curveBasisPoints(curves.curves.e_bike, 42)).toBe(3_550);
    expect(curveBasisPoints(curves.curves.e_bike, 55)).toBe(2_750);
  });

  it('holds the last value beyond the curve', () => {
    expect(curveBasisPoints(curves.curves.e_bike, 100)).toBe(2_500);
  });

  it('rounds a share of a basis point half up', () => {
    const points: [number, number][] = [
      [0, 100],
      [2, 99.99],
    ];
    expect(curveBasisPoints(points, 1)).toBe(10_000);
  });

  it('rejects an empty curve', () => {
    expect(() => curveBasisPoints([], 1)).toThrow(RangeError);
  });
});

describe('usageBasisPoints', () => {
  it('counts whole steps only', () => {
    expect(usageBasisPoints(curves.usage_adjustment.e_bike, 0)).toBe(10_000);
    expect(usageBasisPoints(curves.usage_adjustment.e_bike, 999)).toBe(10_000);
    expect(usageBasisPoints(curves.usage_adjustment.e_bike, 1_000)).toBe(9_800);
    expect(usageBasisPoints(curves.usage_adjustment.e_bike, 9_800)).toBe(8_200);
  });

  it('stops at the cap', () => {
    expect(usageBasisPoints(curves.usage_adjustment.e_bike, 10_000)).toBe(8_000);
    expect(usageBasisPoints(curves.usage_adjustment.e_bike, 18_400)).toBe(8_000);
  });
});

describe('marketValue', () => {
  const ebike008 = {
    category: 'e_bike' as const,
    condition: 'good' as const,
    usageValue: 9_800,
    firstLeasePriceCents: 179_900,
    ageMonths: 55,
  };

  it('multiplies the factors and rounds once (ebike-008)', () => {
    expect(marketValue(curves, ebike008)).toEqual({
      market_value_cents: 34_482,
      age_months: 55,
      curve_basis_points: 2_750,
      condition_basis_points: 8_500,
      usage_basis_points: 8_200,
    });
  });

  it('values a fair item with capped usage (ebike-007)', () => {
    const value = marketValue(curves, {
      ...ebike008,
      condition: 'fair',
      usageValue: 18_400,
      firstLeasePriceCents: 549_000,
      ageMonths: 42,
    });
    expect(value.market_value_cents).toBe(101_345);
  });

  it('keeps the whole price for a new item at age 0', () => {
    const value = marketValue(curves, {
      ...ebike008,
      condition: 'new',
      usageValue: 0,
      ageMonths: 0,
    });
    expect(value.market_value_cents).toBe(179_900);
  });

  it('stays exact on a large price', () => {
    const value = marketValue(curves, {
      category: 'farm_machine',
      condition: 'new',
      usageValue: 0,
      firstLeasePriceCents: 26_000_000,
      ageMonths: 0,
    });
    expect(value.market_value_cents).toBe(26_000_000);
  });

  it('is worth less in a worse condition', () => {
    const worth = (condition: 'good' | 'fair' | 'poor') =>
      marketValue(curves, { ...ebike008, condition }).market_value_cents;
    expect(worth('good')).toBeGreaterThan(worth('fair'));
    expect(worth('fair')).toBeGreaterThan(worth('poor'));
  });
});

describe('firstLease', () => {
  const seeded = { first_leased_on: '2022-03-07', first_lease_price_cents: 179_900 };
  const life = { started_on: '2026-11-05', first_lease_price_cents: 389_000 };

  it('prefers the first recorded life', () => {
    expect(firstLease({}, life)).toEqual({ date: '2026-11-05', priceCents: 389_000 });
    expect(firstLease(seeded, life)).toEqual({ date: '2026-11-05', priceCents: 389_000 });
  });

  it('falls back to the asset for an item leased before the app', () => {
    expect(firstLease(seeded, null)).toEqual({ date: '2022-03-07', priceCents: 179_900 });
    const blank = { started_on: null, first_lease_price_cents: null };
    expect(firstLease(seeded, blank)).toEqual({ date: '2022-03-07', priceCents: 179_900 });
  });

  it('gives nothing when either fact is unknown', () => {
    expect(firstLease({}, null)).toBeNull();
    expect(firstLease({ first_leased_on: '2022-03-07' }, null)).toBeNull();
  });
});

describe('relistProblem', () => {
  it.each(['new', 'like_new', 'good'] as const)('accepts a %s item', (condition) => {
    expect(relistProblem(condition, 100_000, table)).toBeNull();
  });

  it.each(['fair', 'poor'] as const)('refuses a %s item', (condition) => {
    expect(relistProblem(condition, 100_000, table)).toBe('condition_too_low');
  });

  it('refuses a price nobody could lease at', () => {
    expect(relistProblem('good', 29_999, table)).toBe('below_minimum');
    expect(relistProblem('good', 30_000, table)).toBeNull();
  });
});
