import { describe, expect, it } from 'vitest';
import { addDays, addMonthsClamped, isMonthEnd, wholeMonthsBetween } from './calendar';

describe('calendar helpers', () => {
  it('preserves a month-end anchor across short and long months', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonthsClamped('2026-01-31', 3)).toBe('2026-04-30');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('does not turn an ordinary day into a month-end anchor', () => {
    expect(addMonthsClamped('2026-01-30', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-30', 2)).toBe('2026-03-30');
    expect(addMonthsClamped('2026-01-17', 1)).toBe('2026-02-17');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('identifies month-end dates', () => {
    expect(isMonthEnd('2026-02-28')).toBe(true);
    expect(isMonthEnd('2028-02-28')).toBe(false);
    expect(isMonthEnd('2028-02-29')).toBe(true);
    expect(isMonthEnd('2026-02-17')).toBe(false);
  });
});

describe('wholeMonthsBetween', () => {
  it('counts completed months only', () => {
    expect(wholeMonthsBetween('2023-01-01', '2026-11-06')).toBe(46);
    expect(wholeMonthsBetween('2026-01-15', '2026-02-14')).toBe(0);
    expect(wholeMonthsBetween('2026-01-15', '2026-02-15')).toBe(1);
  });

  it('is zero for the same day', () => {
    expect(wholeMonthsBetween('2026-11-06', '2026-11-06')).toBe(0);
  });
});
