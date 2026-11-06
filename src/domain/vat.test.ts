import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { mergeVatRates, nextVatChange, vatPercentOn } from './vat';

let vatRates: VatRates;
beforeAll(async () => {
  vatRates = await loadVatRates();
});

describe('vatPercentOn', () => {
  it('is 25.5 % up to and including 31 Dec 2026', () => {
    expect(vatPercentOn(vatRates, '2026-11-05')).toBe(25.5);
    expect(vatPercentOn(vatRates, '2026-12-31')).toBe(25.5);
  });

  it('is the fictional 26 % from 1 Jan 2027, with no end', () => {
    expect(vatPercentOn(vatRates, '2027-01-01')).toBe(26);
    expect(vatPercentOn(vatRates, '2040-06-30')).toBe(26);
  });

  it('switches from 24 % to 25.5 % on 1 Sep 2024', () => {
    expect(vatPercentOn(vatRates, '2024-08-31')).toBe(24);
    expect(vatPercentOn(vatRates, '2024-09-01')).toBe(25.5);
  });

  it('has no rate before the first one starts', () => {
    expect(vatPercentOn(vatRates, '2012-12-31')).toBeNull();
  });

  it('throws on a date that is not YYYY-MM-DD', () => {
    expect(() => vatPercentOn(vatRates, '5.11.2026')).toThrow(RangeError);
  });
});

describe('mergeVatRates', () => {
  it('returns the data pack unchanged without admin changes', () => {
    expect(mergeVatRates(vatRates, [])).toBe(vatRates);
  });

  it('adds a later change that runs until further notice', () => {
    const merged = mergeVatRates(vatRates, [{ validFrom: '2027-07-01', ratePercent: 27 }]);
    expect(vatPercentOn(merged, '2027-06-30')).toBe(26);
    expect(vatPercentOn(merged, '2027-07-01')).toBe(27);
    expect(vatPercentOn(merged, '2035-01-01')).toBe(27);
    expect(merged.rates.at(-2)).toMatchObject({ valid_from: '2027-01-01', valid_to: '2027-06-30' });
  });

  it('puts a change in the middle of a data pack rate, which resumes at its next date', () => {
    const merged = mergeVatRates(vatRates, [{ validFrom: '2026-12-01', ratePercent: 30 }]);
    expect(vatPercentOn(merged, '2026-11-30')).toBe(25.5);
    expect(vatPercentOn(merged, '2026-12-15')).toBe(30);
    expect(vatPercentOn(merged, '2027-01-01')).toBe(26); // the data pack's 2027 rate still starts
  });

  it('lets an admin change replace a data pack rate on the same date', () => {
    const merged = mergeVatRates(vatRates, [{ validFrom: '2027-01-01', ratePercent: 25.5 }]);
    expect(vatPercentOn(merged, '2027-01-01')).toBe(25.5);
    expect(merged.rates.filter((r) => r.valid_from === '2027-01-01')).toHaveLength(1);
  });

  it('keeps the list gap-free: each rate ends the day before the next starts', () => {
    const merged = mergeVatRates(vatRates, [
      { validFrom: '2028-03-01', ratePercent: 24 },
      { validFrom: '2027-07-01', ratePercent: 27 },
    ]);
    for (let i = 1; i < merged.rates.length; i++) {
      const previousEnd = merged.rates[i - 1]?.valid_to;
      const start = merged.rates[i]?.valid_from ?? '';
      const dayAfter = new Date(`${previousEnd}T00:00:00Z`);
      dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
      expect(dayAfter.toISOString().slice(0, 10)).toBe(start);
    }
    expect(merged.rates.at(-1)).toMatchObject({ rate_percent: 24, valid_to: null });
  });
});

describe('nextVatChange', () => {
  it('finds the January 2027 change during a lease that runs past it', () => {
    expect(nextVatChange(vatRates, '2026-11-06', '2029-11-05')).toEqual({
      validFrom: '2027-01-01',
      ratePercent: 26,
    });
  });

  it('is null when the rate stays the same for the whole lease', () => {
    expect(nextVatChange(vatRates, '2026-11-06', '2026-12-31')).toBeNull();
    expect(nextVatChange(vatRates, '2027-01-01', '2030-01-01')).toBeNull();
  });
});
