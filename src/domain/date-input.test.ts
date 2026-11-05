import { describe, expect, it } from 'vitest';
import { formatDayMonthYear, parseDayMonthYear } from './date-input';

describe('parseDayMonthYear', () => {
  it('reads day/month/year into an ISO date', () => {
    expect(parseDayMonthYear('31/12/1990')).toBe('1990-12-31');
    expect(parseDayMonthYear('05/11/2026')).toBe('2026-11-05');
  });

  it('puts the day first, so 03/10 is 3 October and not 10 March', () => {
    expect(parseDayMonthYear('03/10/2009')).toBe('2009-10-03');
  });

  it('accepts dots and dashes and single-digit days and months', () => {
    expect(parseDayMonthYear('5.11.2026')).toBe('2026-11-05');
    expect(parseDayMonthYear('5-1-2026')).toBe('2026-01-05');
    expect(parseDayMonthYear('  1/2/2000  ')).toBe('2000-02-01');
  });

  it('knows month lengths and leap years', () => {
    expect(parseDayMonthYear('29/02/2024')).toBe('2024-02-29');
    expect(parseDayMonthYear('29/02/2023')).toBeNull();
    expect(parseDayMonthYear('29/02/1900')).toBeNull(); // not a leap year
    expect(parseDayMonthYear('29/02/2000')).toBe('2000-02-29'); // a leap year
    expect(parseDayMonthYear('31/04/2026')).toBeNull();
    expect(parseDayMonthYear('30/04/2026')).toBe('2026-04-30');
  });

  it('rejects impossible and malformed dates', () => {
    for (const bad of [
      '',
      '0/1/2000',
      '1/0/2000',
      '32/01/2000',
      '01/13/2000',
      '1/1/99',
      '1/1/20000',
      '2000-01-31',
      '31/12',
      'ab/cd/efgh',
      '1/1/2000/1',
    ]) {
      expect(parseDayMonthYear(bad), bad).toBeNull();
    }
  });
});

describe('formatDayMonthYear', () => {
  it('writes an ISO date as day/month/year', () => {
    expect(formatDayMonthYear('1990-12-31')).toBe('31/12/1990');
    expect(formatDayMonthYear('2026-01-05')).toBe('05/01/2026');
  });

  it('leaves anything that is not an ISO date alone', () => {
    expect(formatDayMonthYear('')).toBe('');
    expect(formatDayMonthYear('yesterday')).toBe('yesterday');
  });

  it('round-trips with parseDayMonthYear', () => {
    expect(parseDayMonthYear(formatDayMonthYear('2009-03-10'))).toBe('2009-03-10');
  });
});
