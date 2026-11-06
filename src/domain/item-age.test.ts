import { describe, expect, it } from 'vitest';
import { firstLeasedNewOn, itemAgeOn } from './item-age';

describe('itemAgeOn: an item first leased new counts from that lease start', () => {
  // ebike-003: model year 2026, new, first lease starts 5 Nov 2026 (the walkthrough's B1 case).
  const clock = { modelYear: 2026, firstLeasedNewOn: '2026-11-05' };

  it('is 0 on the start day and until the first anniversary', () => {
    expect(itemAgeOn(clock, '2026-11-05')).toBe(0);
    expect(itemAgeOn(clock, '2026-12-04')).toBe(0); // one day short of a month
  });

  it('counts whole months passed', () => {
    expect(itemAgeOn(clock, '2026-12-05')).toBe(1);
    expect(itemAgeOn(clock, '2027-09-05')).toBe(10); // Nov → Sep = 10 anniversaries
    expect(itemAgeOn(clock, '2027-11-05')).toBe(12);
  });

  it('is never below zero', () => {
    expect(itemAgeOn(clock, '2026-01-01')).toBe(0);
  });

  it('uses clamped month ends, like the invoice schedule (D-016)', () => {
    const endOfJan = { modelYear: 2026, firstLeasedNewOn: '2026-01-31' };
    expect(itemAgeOn(endOfJan, '2026-02-27')).toBe(0);
    expect(itemAgeOn(endOfJan, '2026-02-28')).toBe(1); // 31 Jan + 1 month = 28 Feb
  });
});

describe('itemAgeOn: any other item counts from 1 January of its model year', () => {
  const clock = (modelYear: number) => ({ modelYear, firstLeasedNewOn: null });

  it('matches the old model-year rule (D-033, D-035)', () => {
    expect(itemAgeOn(clock(2023), '2026-11-06')).toBe(46); // 3 × 12 + 10
    expect(itemAgeOn(clock(2023), '2023-01-01')).toBe(0);
    expect(itemAgeOn(clock(2023), '2023-12-31')).toBe(11);
    expect(itemAgeOn(clock(2023), '2024-01-01')).toBe(12);
  });

  it('is never below zero for a model year still ahead', () => {
    expect(itemAgeOn(clock(2027), '2026-11-06')).toBe(0);
  });
});

describe('firstLeasedNewOn', () => {
  it('is the first lease start for an item received new with no earlier lives', () => {
    expect(firstLeasedNewOn({ condition: 'new', previousLives: 0 }, '2026-11-05')).toBe(
      '2026-11-05'
    );
  });

  it('is null for a used item, an item with earlier lives, or one never leased', () => {
    expect(firstLeasedNewOn({ condition: 'fair', previousLives: 0 }, '2026-11-05')).toBeNull();
    expect(firstLeasedNewOn({ condition: 'new', previousLives: 1 }, '2026-11-05')).toBeNull();
    expect(firstLeasedNewOn({ condition: 'new', previousLives: 0 }, null)).toBeNull();
  });
});
