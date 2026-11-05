import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addDays, addMonthsClamped, isIsoDate } from './calendar';

describe('addDays', () => {
  it('moves within a month and across a month end', () => {
    expect(addDays('2026-11-05', 7)).toBe('2026-11-12');
    expect(addDays('2026-11-28', 7)).toBe('2026-12-05');
  });

  it('crosses a year end', () => {
    expect(addDays('2026-12-29', 7)).toBe('2027-01-05');
  });

  it('counts 29 February in a leap year and skips it otherwise', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('goes backwards with a negative number of days', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('throws on a malformed or impossible date, which is a bug', () => {
    expect(() => addDays('5.11.2026', 1)).toThrow(RangeError);
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
    expect(() => addDays('2026-11-05', 1.5)).toThrow(RangeError);
  });
});

describe('addMonthsClamped', () => {
  it('keeps the day of the month when the target month has it', () => {
    expect(addMonthsClamped('2026-09-15', 3)).toBe('2026-12-15');
    expect(addMonthsClamped('2026-09-15', 4)).toBe('2027-01-15');
  });

  it('moves a 31st back to the last day of a short month (card 4)', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-31', 3)).toBe('2026-04-30');
  });

  it('returns to the 31st after a short month: counted from the start, it never drifts', () => {
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
  });

  it('lands on 29 February in a leap year (Feb 2028 is 25 months after Jan 2026)', () => {
    expect(addMonthsClamped('2026-01-31', 25)).toBe('2028-02-29');
    expect(addMonthsClamped('2028-02-29', 12)).toBe('2029-02-28');
  });

  it('returns the start date for zero months', () => {
    expect(addMonthsClamped('2026-11-05', 0)).toBe('2026-11-05');
  });

  it('throws on negative or fractional months, which are bugs', () => {
    expect(() => addMonthsClamped('2026-11-05', -1)).toThrow(RangeError);
    expect(() => addMonthsClamped('2026-11-05', 1.5)).toThrow(RangeError);
  });
});

describe('addMonthsClamped properties (random dates and month counts)', () => {
  // Any day from 2000 to 2050 (leap years and 2000 itself included), up to 10 years ahead.
  const anyDate = fc.integer({ min: 0, max: 365 * 50 }).map((d) => addDays('2000-01-01', d));
  const parts = (iso: string) => iso.split('-').map(Number) as [number, number, number];

  it('lands exactly n calendar months later, on a day no later than the start day', () => {
    fc.assert(
      fc.property(anyDate, fc.integer({ min: 0, max: 120 }), (start, months) => {
        const [startYear, startMonth, startDay] = parts(start);
        const [year, month, day] = parts(addMonthsClamped(start, months));
        expect(year * 12 + month).toBe(startYear * 12 + startMonth + months);
        expect(day).toBeLessThanOrEqual(startDay);
      })
    );
  });

  it('keeps the start day, or moves only to the last day of a shorter month', () => {
    fc.assert(
      fc.property(anyDate, fc.integer({ min: 0, max: 120 }), (start, months) => {
        const result = addMonthsClamped(start, months);
        const kept = parts(result)[2] === parts(start)[2];
        // The day after a month's last day is the 1st.
        const lastOfMonth = parts(addDays(result, 1))[2] === 1;
        expect(kept || lastOfMonth).toBe(true);
      })
    );
  });
});

describe('isIsoDate', () => {
  it('accepts real dates and refuses impossible or malformed ones', () => {
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2027-02-29')).toBe(false);
    expect(isIsoDate('10.03.2009')).toBe(false);
  });
});
