import { describe, expect, it } from 'vitest';
import { isAllowedInspection, suggestReturnCondition, worseOf } from './inspection';

const bike = (
  conditionOut: Parameters<typeof suggestReturnCondition>[0]['conditionOut'],
  km: number
) => suggestReturnCondition({ category: 'e_bike', conditionOut, usedDuringLease: km }).condition;

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

  it('never goes below poor', () => {
    expect(bike('fair', 100_000)).toBe('poor');
  });

  it('uses each category’s own step', () => {
    expect(
      suggestReturnCondition({ category: 'laptop', conditionOut: 'new', usedDuringLease: 600 })
    ).toEqual({ condition: 'fair', gradesForUse: 2 });
    expect(
      suggestReturnCondition({
        category: 'farm_machine',
        conditionOut: 'good',
        usedDuringLease: 999,
      })
    ).toEqual({ condition: 'good', gradesForUse: 0 });
  });

  it('a negative reading difference counts as no use', () => {
    expect(bike('good', -50)).toBe('good');
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
