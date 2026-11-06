import { describe, expect, it } from 'vitest';
import { addDays } from './civil-days';

describe('addDays', () => {
  it('gives a quote from 2026-11-05 a validity to 2026-11-19 (D7, 14 days)', () => {
    expect(addDays('2026-11-05', 14)).toBe('2026-11-19');
  });

  it('crosses month and year ends', () => {
    expect(addDays('2026-11-25', 14)).toBe('2026-12-09');
    expect(addDays('2026-12-25', 14)).toBe('2027-01-08');
  });

  it('knows leap days', () => {
    expect(addDays('2028-02-20', 9)).toBe('2028-02-29');
    expect(addDays('2027-02-20', 9)).toBe('2027-03-01');
    expect(addDays('2100-02-28', 1)).toBe('2100-03-01');
    expect(addDays('2000-02-28', 1)).toBe('2000-02-29');
  });

  it('adds zero and negative days', () => {
    expect(addDays('2026-01-01', 0)).toBe('2026-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('crosses the month and year ends of the invoice periods (D3, D4)', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });

  it('throws on a day that does not exist', () => {
    expect(() => addDays('2026-02-29', 1)).toThrow(RangeError);
    expect(() => addDays('2026-04-31', 1)).toThrow(RangeError);
  });

  it('throws on a malformed day or a fractional count', () => {
    expect(() => addDays('2026-01-01', 0.5)).toThrow(RangeError);
    expect(() => addDays('2026-13-01', 1)).toThrow(RangeError);
    expect(() => addDays('5.11.2026', 1)).toThrow(RangeError);
    expect(() => addDays('2026-11-05', 1.5)).toThrow(RangeError);
  });
});

describe('addDays against Date.UTC (from the invoices session, commit 0a17495)', () => {
  it('agrees with Date.UTC on every day from 1900 to 2200, forward and back from 1970-01-01', () => {
    const DAY_MS = 86_400_000;
    const first = Date.UTC(1900, 0, 1) / DAY_MS;
    const last = Date.UTC(2200, 11, 31) / DAY_MS;
    // One expect at the end: 220 000 expect calls took over Vitest's 5 s under coverage.
    const mismatches: string[] = [];
    for (let days = first; days <= last; days += 1) {
      const iso = new Date(days * DAY_MS).toISOString().slice(0, 10);
      if (addDays('1970-01-01', days) !== iso) mismatches.push(`+${days} → ${iso}`);
      if (addDays(iso, -days) !== '1970-01-01') mismatches.push(`${iso} −${days}`);
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });
});
