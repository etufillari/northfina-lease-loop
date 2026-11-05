import { describe, expect, it } from 'vitest';
import { AS_OF_MAX, AS_OF_MIN, effectiveToday, parseAsOfDate } from './as-of';

describe('parseAsOfDate', () => {
  it('accepts a real date inside the demo range', () => {
    // Card 3 starts on 15 Sep 2026, card 4 on 31 Jan 2026 (CHALLENGE.md).
    expect(parseAsOfDate('2026-09-15')).toEqual({ ok: true, date: '2026-09-15' });
    expect(parseAsOfDate('2026-01-31')).toEqual({ ok: true, date: '2026-01-31' });
  });

  it('accepts both ends of the range', () => {
    expect(AS_OF_MIN).toBe('2026-01-01'); // first price list is valid from 1 Jan 2026 (DATA.md)
    expect(AS_OF_MAX).toBe('2035-12-31');
    expect(parseAsOfDate('2026-01-01')).toEqual({ ok: true, date: '2026-01-01' });
    expect(parseAsOfDate('2035-12-31')).toEqual({ ok: true, date: '2035-12-31' });
  });

  it('refuses dates outside the range', () => {
    expect(parseAsOfDate('2025-12-31')).toEqual({ ok: false, reason: 'out_of_range' });
    expect(parseAsOfDate('2036-01-01')).toEqual({ ok: false, reason: 'out_of_range' });
  });

  it('accepts 29 Feb only in a leap year', () => {
    expect(parseAsOfDate('2028-02-29')).toEqual({ ok: true, date: '2028-02-29' });
    expect(parseAsOfDate('2027-02-29')).toEqual({ ok: false, reason: 'not_a_date' });
  });

  it('refuses anything that is not a YYYY-MM-DD calendar date', () => {
    for (const value of [
      '',
      '2026-9-15',
      '15.09.2026',
      '2026-09-15T00:00:00Z',
      ' 2026-09-15',
      '2026-13-01',
      '2026-04-31',
      '2026-00-10',
      '<script>',
    ]) {
      expect(parseAsOfDate(value), value).toEqual({ ok: false, reason: 'not_a_date' });
    }
  });

  it('refuses non-strings and a missing value', () => {
    expect(parseAsOfDate(undefined)).toEqual({ ok: false, reason: 'not_a_date' });
    expect(parseAsOfDate(null)).toEqual({ ok: false, reason: 'not_a_date' });
    expect(parseAsOfDate(20260915)).toEqual({ ok: false, reason: 'not_a_date' });
  });
});

describe('effectiveToday', () => {
  const realToday = '2026-11-06';

  it('uses the real date when there is no demo date', () => {
    expect(effectiveToday(undefined, realToday)).toEqual({
      date: '2026-11-06',
      realToday: '2026-11-06',
      isDemo: false,
    });
  });

  it('uses a valid demo date and flags it', () => {
    expect(effectiveToday('2026-11-05', realToday)).toEqual({
      date: '2026-11-05',
      realToday: '2026-11-06',
      isDemo: true,
    });
  });

  it('is not a demo when the demo date is the real date', () => {
    expect(effectiveToday('2026-11-06', realToday).isDemo).toBe(false);
  });

  it('ignores a tampered or out-of-range value and falls back to the real date', () => {
    expect(effectiveToday('2026-02-30', realToday)).toEqual({
      date: '2026-11-06',
      realToday: '2026-11-06',
      isDemo: false,
    });
    expect(effectiveToday('1999-01-01', realToday).date).toBe('2026-11-06');
  });
});
