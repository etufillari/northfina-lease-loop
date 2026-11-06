import { describe, expect, it } from 'vitest';
import {
  addMonthsClamped,
  compareIso,
  daysInMonth,
  formatIsoDate,
  isRealIsoDate,
  parseIsoDate,
  termEndDate,
} from './dates';

describe('addMonthsClamped (card 4, D3)', () => {
  it('clamps 31 Jan + 1 to 28 Feb 2026', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
  });
  it('clamps 31 Jan 2026 + 25 to the leap day 29 Feb 2028', () => {
    expect(addMonthsClamped('2026-01-31', 25)).toBe('2028-02-29');
  });
  it('keeps 31 Jan + 2 on 31 Mar: the clamp never accumulates', () => {
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
  });
  it('crosses a year end and keeps an ordinary day', () => {
    expect(addMonthsClamped('2026-11-05', 2)).toBe('2027-01-05');
    expect(addMonthsClamped('2026-09-15', 12)).toBe('2027-09-15');
  });
  it('clamps 30 and 29 Jan in a non-leap February', () => {
    expect(addMonthsClamped('2027-01-30', 1)).toBe('2027-02-28');
    expect(addMonthsClamped('2027-01-29', 1)).toBe('2027-02-28');
  });
  it('steps back with negative months and zero is the same day', () => {
    expect(addMonthsClamped('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonthsClamped('2026-01-15', 0)).toBe('2026-01-15');
  });
  it('throws on a fraction of a month or an impossible day', () => {
    expect(() => addMonthsClamped('2026-01-15', 1.5)).toThrow(RangeError);
    expect(() => addMonthsClamped('2026-02-30', 1)).toThrow(RangeError);
  });
});

describe('daysInMonth (leap years)', () => {
  it('gives February 29 days in 2028 and 2000, 28 in 2026 and 2100', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2100, 2)).toBe(28);
  });
  it('gives 30 and 31 day months', () => {
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
  it('throws on month 0 and 13', () => {
    expect(() => daysInMonth(2026, 0)).toThrow(RangeError);
    expect(() => daysInMonth(2026, 13)).toThrow(RangeError);
  });
});

describe('compareIso', () => {
  it('orders days', () => {
    expect(compareIso('2026-12-31', '2027-01-01')).toBe(-1);
    expect(compareIso('2027-01-01', '2027-01-01')).toBe(0);
    expect(compareIso('2027-01-02', '2027-01-01')).toBe(1);
  });
  it('throws on a malformed day', () => {
    expect(() => compareIso('2027-1-1', '2027-01-01')).toThrow(RangeError);
  });
});

describe('parseIsoDate, formatIsoDate, isRealIsoDate', () => {
  it('round-trips a day', () => {
    expect(formatIsoDate(parseIsoDate('2028-02-29'))).toBe('2028-02-29');
  });
  it('tells real days from impossible ones', () => {
    expect(isRealIsoDate('2028-02-29')).toBe(true);
    expect(isRealIsoDate('2100-02-29')).toBe(false);
    expect(isRealIsoDate('2026-04-31')).toBe(false);
    expect(isRealIsoDate('2026-13-01')).toBe(false);
    expect(isRealIsoDate('not a day')).toBe(false);
  });
});

describe('termEndDate', () => {
  it('ends card 4 on 30 Jan 2029 and card 1 on 4 Nov 2029', () => {
    expect(termEndDate('2026-01-31', 36)).toBe('2029-01-30');
    expect(termEndDate('2026-11-05', 36)).toBe('2029-11-04');
  });
});
