import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { vatPercentOn } from './vat';

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
