import { describe, expect, it } from 'vitest';
import type { AssetCondition } from '@/data/schemas';
import { isAllowedInspection, suggestReturnCondition, worseOf } from './inspection';

/** An e-bike set to `baseline` at 0 km that went out `out` and now has `km` on the clock. */
const bike = (baseline: AssetCondition, km: number, out: AssetCondition = baseline) =>
  suggestReturnCondition({
    category: 'e_bike',
    conditionOut: out,
    baseline: { condition: baseline, usageTotal: 0 },
    usageTotalNow: km,
  }).condition;

describe('suggestReturnCondition', () => {
  it('a used item is never new again', () => {
    expect(bike('new', 0)).toBe('like_new');
    expect(bike('new', 4999)).toBe('like_new');
  });

  it('drops one grade per full 5,000 km on an e-bike', () => {
    expect(bike('new', 5000)).toBe('good');
    expect(bike('new', 12_000)).toBe('fair');
    expect(bike('good', 5000)).toBe('fair');
    expect(bike('like_new', 0)).toBe('like_new');
  });

  it('counts wear across leases: 4,900 km twice wears it like 9,800 km once', () => {
    // First lease: new → like new (under one step).
    expect(bike('new', 4900)).toBe('like_new');
    // Second lease: went out like new, but 9,800 km since it was new.
    expect(bike('new', 9800, 'like_new')).toBe('good');
    expect(bike('new', 10_000, 'like_new')).toBe('fair');
  });

  it('counts from the baseline usage, not from zero', () => {
    const result = suggestReturnCondition({
      category: 'e_bike',
      conditionOut: 'good',
      baseline: { condition: 'good', usageTotal: 18_400 },
      usageTotalNow: 23_000,
    });
    expect(result).toEqual({ condition: 'good', usedSinceBaseline: 4600, gradesForUse: 0 });
  });

  it('never better than it went out: a grade lowered for damage stays lowered', () => {
    expect(bike('new', 1000, 'fair')).toBe('fair');
  });

  it('never goes below poor', () => {
    expect(bike('fair', 100_000)).toBe('poor');
  });

  it('uses each category’s own step', () => {
    const at = (category: 'laptop' | 'farm_machine', used: number, cond: AssetCondition) =>
      suggestReturnCondition({
        category,
        conditionOut: cond,
        baseline: { condition: cond, usageTotal: 0 },
        usageTotalNow: used,
      });
    expect(at('laptop', 600, 'new')).toMatchObject({ condition: 'fair', gradesForUse: 2 });
    expect(at('farm_machine', 999, 'good')).toMatchObject({ condition: 'good', gradesForUse: 0 });
  });

  it('a reading below the baseline counts as no use', () => {
    const result = suggestReturnCondition({
      category: 'e_bike',
      conditionOut: 'good',
      baseline: { condition: 'good', usageTotal: 500 },
      usageTotalNow: 100,
    });
    expect(result.usedSinceBaseline).toBe(0);
  });
});

describe('inspection bounds', () => {
  it('an inspection grades as it went out or worse, never better', () => {
    expect(isAllowedInspection('good', 'good')).toBe(true);
    expect(isAllowedInspection('good', 'fair')).toBe(true);
    expect(isAllowedInspection('good', 'like_new')).toBe(false);
    expect(worseOf('like_new', 'fair')).toBe('fair');
  });
});
