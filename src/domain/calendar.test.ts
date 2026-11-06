import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthsClamped,
  compareIso,
  daysInMonth,
  isValidIsoDate,
  monthsBetween,
} from './calendar';

describe('isValidIsoDate', () => {
  it('accepts real calendar dates', () => {
    expect(isValidIsoDate('2026-11-05')).toBe(true);
    expect(isValidIsoDate('2028-02-29')).toBe(true);
    expect(isValidIsoDate('2000-02-29')).toBe(true);
  });

  it('rejects impossible dates and bad shapes', () => {
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('1900-02-29')).toBe(false);
    expect(isValidIsoDate('2026-04-31')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-00-10')).toBe(false);
    expect(isValidIsoDate('2026-1-5')).toBe(false);
    expect(isValidIsoDate('05.11.2026')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
  });
});

describe('compareIso', () => {
  it('orders dates', () => {
    expect(compareIso('2026-11-05', '2026-11-06')).toBe(-1);
    expect(compareIso('2027-01-01', '2026-12-31')).toBe(1);
    expect(compareIso('2026-11-05', '2026-11-05')).toBe(0);
  });

  it('throws on an invalid date', () => {
    expect(() => compareIso('2026-02-30', '2026-03-01')).toThrow(RangeError);
  });
});

describe('addDays', () => {
  it('moves across month and year ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-12-05', -1)).toBe('2026-12-04');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('knows leap days', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('returns the same date for 0', () => {
    expect(addDays('2026-11-05', 0)).toBe('2026-11-05');
  });

  it('throws on bad input', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
    expect(() => addDays('2026-11-05', 1.5)).toThrow(RangeError);
  });

  it('round-trips (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -5_000, max: 5_000 }), (n) => {
        const moved = addDays('2026-11-05', n);
        return isValidIsoDate(moved) && addDays(moved, -n) === '2026-11-05';
      })
    );
  });
});

describe('addMonthsClamped (moved from invoice-schedule)', () => {
  it('clamps to the month length without drifting', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonthsClamped('2026-01-31', 25)).toBe('2028-02-29');
  });

  it('rejects an impossible start date', () => {
    expect(() => addMonthsClamped('2026-02-31', 1)).toThrow(RangeError);
  });
});

describe('monthsBetween', () => {
  it('counts whole months, anchored to the start day', () => {
    expect(monthsBetween('2026-11-05', '2026-11-05')).toBe(0);
    expect(monthsBetween('2026-11-05', '2026-12-04')).toBe(0);
    expect(monthsBetween('2026-11-05', '2026-12-05')).toBe(1);
    expect(monthsBetween('2026-11-05', '2027-06-05')).toBe(7);
    expect(monthsBetween('2023-01-01', '2026-11-05')).toBe(46);
  });

  it('treats a clamped month end as a whole month', () => {
    expect(monthsBetween('2026-01-31', '2026-02-28')).toBe(1);
    expect(monthsBetween('2026-01-31', '2026-02-27')).toBe(0);
  });

  it('throws when the end is before the start', () => {
    expect(() => monthsBetween('2026-11-05', '2026-11-04')).toThrow(RangeError);
  });

  it('is the inverse of addMonthsClamped (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 2100 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 31 }),
        fc.integer({ min: 0, max: 120 }),
        (y, m, d, k) => {
          const day = Math.min(d, daysInMonth(y, m));
          const start = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return monthsBetween(start, addMonthsClamped(start, k)) === k;
        }
      )
    );
  });
});
