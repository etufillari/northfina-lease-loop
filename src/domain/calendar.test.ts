import { describe, expect, it } from 'vitest';
import { addMonthsClamped, daysInMonth, isLeapYear, previousDay } from './calendar';

describe('isLeapYear', () => {
  it('follows the 4 / 100 / 400 rules', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });
});

describe('daysInMonth', () => {
  it('knows short months and leap Februaries', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('rejects an impossible month', () => {
    expect(() => daysInMonth(2026, 0)).toThrow(RangeError);
    expect(() => daysInMonth(2026, 13)).toThrow(RangeError);
  });
});

describe('addMonthsClamped', () => {
  it('keeps the start day in long months', () => {
    expect(addMonthsClamped('2026-09-15', 3)).toBe('2026-12-15');
    expect(addMonthsClamped('2026-11-05', 2)).toBe('2027-01-05');
  });

  it('clamps a 31st to short months without losing the anchor (scenario card 4)', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonthsClamped('2026-01-31', 25)).toBe('2028-02-29');
  });

  it('clamps the 31st to 30-day months', () => {
    expect(addMonthsClamped('2026-03-31', 1)).toBe('2026-04-30');
  });

  it('handles a leap-day start', () => {
    expect(addMonthsClamped('2024-02-29', 12)).toBe('2025-02-28');
    expect(addMonthsClamped('2024-02-29', 48)).toBe('2028-02-29');
  });

  it('adding zero months is the start date itself', () => {
    expect(addMonthsClamped('2026-11-05', 0)).toBe('2026-11-05');
  });

  it('rejects bad input', () => {
    expect(() => addMonthsClamped('2026-02-30', 1)).toThrow(RangeError);
    expect(() => addMonthsClamped('05.11.2026', 1)).toThrow(RangeError);
    expect(() => addMonthsClamped('2026-11-05', 1.5)).toThrow(RangeError);
    expect(() => addMonthsClamped('2026-11-05', -1)).toThrow(RangeError);
  });
});

describe('previousDay', () => {
  it('steps back inside a month', () => {
    expect(previousDay('2026-11-05')).toBe('2026-11-04');
  });

  it('steps back over month and year ends, leap years included', () => {
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2028-03-01')).toBe('2028-02-29');
    expect(previousDay('2026-01-01')).toBe('2025-12-31');
  });
});
