import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addMonthsClamped, assertIsoDate, daysInMonth, isLeapYear, previousDay } from './calendar';

describe('isLeapYear', () => {
  it('follows the 4 / 100 / 400 rule', () => {
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });
});

describe('daysInMonth', () => {
  it('knows short months and February', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('assertIsoDate', () => {
  it('accepts real dates, including a leap day', () => {
    expect(() => assertIsoDate('2028-02-29')).not.toThrow();
  });

  it.each(['2026-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-1-1', 'tomorrow'])(
    'rejects %s',
    (date) => {
      expect(() => assertIsoDate(date)).toThrow(RangeError);
    }
  );
});

describe('addMonthsClamped', () => {
  it('keeps the day when the month is long enough', () => {
    expect(addMonthsClamped('2026-09-15', 4)).toBe('2027-01-15');
  });

  it('clamps to the end of a short month', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-30', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-03-31', 1)).toBe('2026-04-30');
  });

  it('uses 29 February in a leap year', () => {
    expect(addMonthsClamped('2026-01-31', 25)).toBe('2028-02-29');
    expect(addMonthsClamped('2026-01-29', 25)).toBe('2028-02-29');
  });

  it('does not lose the day after a short month', () => {
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
  });

  it('moves a leap day to 28 February in a normal year and back on the next leap day', () => {
    expect(addMonthsClamped('2028-02-29', 12)).toBe('2029-02-28');
    expect(addMonthsClamped('2028-02-29', 48)).toBe('2032-02-29');
  });

  it('crosses year ends and returns the same date for zero months', () => {
    expect(addMonthsClamped('2026-12-31', 1)).toBe('2027-01-31');
    expect(addMonthsClamped('2026-11-05', 0)).toBe('2026-11-05');
  });

  it('rejects negative or partial months', () => {
    expect(() => addMonthsClamped('2026-01-31', -1)).toThrow(RangeError);
    expect(() => addMonthsClamped('2026-01-31', 1.5)).toThrow(RangeError);
  });
});

describe('previousDay', () => {
  it('steps within a month and across month, year and leap-day boundaries', () => {
    expect(previousDay('2026-11-05')).toBe('2026-11-04');
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2028-03-01')).toBe('2028-02-29');
    expect(previousDay('2027-01-01')).toBe('2026-12-31');
  });
});

describe('addMonthsClamped properties', () => {
  // A real date: pick the year and month first, then a day that exists in that month.
  const startDate = fc
    .record({ year: fc.integer({ min: 2000, max: 2100 }), month: fc.integer({ min: 1, max: 12 }) })
    .chain(({ year, month }) =>
      fc.integer({ min: 1, max: daysInMonth(year, month) }).map((day) => {
        const pad = (value: number) => String(value).padStart(2, '0');
        return `${year}-${pad(month)}-${pad(day)}`;
      })
    );

  it('lands on a real date in exactly the target month, on the start day or the month end', () => {
    fc.assert(
      fc.property(startDate, fc.integer({ min: 0, max: 120 }), (date, months) => {
        const result = addMonthsClamped(date, months);
        assertIsoDate(result);
        const [y, m] = date.split('-').map(Number) as [number, number];
        const [ry, rm, rd] = result.split('-').map(Number) as [number, number, number];
        const startDay = Number(date.slice(8));
        expect(ry * 12 + rm - (y * 12 + m)).toBe(months);
        expect(rd).toBe(Math.min(startDay, daysInMonth(ry, rm)));
      })
    );
  });
});
