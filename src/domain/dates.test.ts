import { describe, expect, it } from 'vitest';
import { addDays, addMonths, dateParts, isIsoDate, daysInMonth } from './dates';

describe('addDays', () => {
  it('adds days within a month', () => {
    expect(addDays('2026-11-05', 1)).toBe('2026-11-06');
    expect(addDays('2026-11-05', 0)).toBe('2026-11-05');
  });

  it('crosses month and year ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('goes backwards', () => {
    expect(addDays('2029-11-05', -1)).toBe('2029-11-04');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('knows leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('is not shifted by the daylight saving change', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });

  it('throws on a date that is not ISO, because that is a bug in the caller', () => {
    expect(() => addDays('5.11.2026', 1)).toThrow(RangeError);
  });
});

describe('addMonths', () => {
  it('keeps the day when the target month has it', () => {
    expect(addMonths('2026-11-05', 1)).toBe('2026-12-05');
    expect(addMonths('2026-11-05', 0)).toBe('2026-11-05');
  });

  it('crosses the year end', () => {
    expect(addMonths('2026-11-05', 2)).toBe('2027-01-05');
    expect(addMonths('2026-11-05', 36)).toBe('2029-11-05');
    expect(addMonths('2026-12-31', 12)).toBe('2027-12-31');
  });

  it('clamps to the last day of a shorter month (card 4)', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 3)).toBe('2026-04-30');
  });

  it('gives 29 February in a leap year (card 4)', () => {
    expect(addMonths('2026-01-31', 25)).toBe('2028-02-29');
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28');
    expect(addMonths('2024-02-29', 48)).toBe('2028-02-29');
  });

  it('returns to the original day when counted from the start', () => {
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonths(addMonths('2026-01-31', 1), 1)).toBe('2026-03-28');
  });

  it('goes backwards', () => {
    expect(addMonths('2027-01-31', -2)).toBe('2026-11-30');
    expect(addMonths('2027-01-15', -1)).toBe('2026-12-15');
  });

  it('throws on a date that is not ISO', () => {
    expect(() => addMonths('today', 1)).toThrow(RangeError);
  });
});

describe('isIsoDate', () => {
  it('accepts the YYYY-MM-DD shape only', () => {
    expect(isIsoDate('2026-11-05')).toBe(true);
    expect(isIsoDate('5.11.2026')).toBe(false);
    expect(isIsoDate('2026-1-5')).toBe(false);
  });
});

describe('dateParts', () => {
  it('splits a date into numbers', () => {
    expect(dateParts('2026-02-09')).toEqual({ year: 2026, month: 2, day: 9 });
  });

  it('throws on another shape', () => {
    expect(() => dateParts('today')).toThrow(RangeError);
  });
});

describe('daysInMonth', () => {
  it('knows short and long months', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
  });

  it('knows leap years, including the century rule', () => {
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });
});
