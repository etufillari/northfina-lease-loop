import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { vatRateOn, withVat } from './vat';

let rates: VatRates;
beforeAll(async () => {
  rates = await loadVatRates();
});

describe('vatRateOn', () => {
  it('charges 25.5 % on the last day of 2026 and 26 % from 1 January 2027', () => {
    expect(vatRateOn(rates, '2026-12-31')).toEqual({ ok: true, ratePercent: 25.5 });
    expect(vatRateOn(rates, '2027-01-01')).toEqual({ ok: true, ratePercent: 26 });
  });

  it('charges 24 % until 31 August 2024 and 25.5 % from 1 September 2024', () => {
    expect(vatRateOn(rates, '2024-08-31')).toEqual({ ok: true, ratePercent: 24 });
    expect(vatRateOn(rates, '2024-09-01')).toEqual({ ok: true, ratePercent: 25.5 });
  });

  it('keeps charging the open-ended rate far into the future', () => {
    expect(vatRateOn(rates, '2031-02-28')).toEqual({ ok: true, ratePercent: 26 });
  });

  it('has no rate before the first period starts', () => {
    expect(vatRateOn(rates, '2012-12-31')).toEqual({ ok: false, reason: 'no_rate_on_date' });
  });

  it('throws on a date that is not YYYY-MM-DD, which is a bug', () => {
    expect(() => vatRateOn(rates, '31.12.2026')).toThrow(RangeError);
  });
});

describe('withVat', () => {
  it('matches the DATA.md worked example: 10 730 net at 25.5 % → 2 736 VAT, 13 466 gross', () => {
    expect(withVat(10_730, 25.5)).toEqual({
      netCents: 10_730,
      vatCents: 2_736,
      grossCents: 13_466,
    });
  });

  it('charges the same net rent more VAT at 26 %: 10 730 × 26 % = 2 789.8 → 2 790', () => {
    expect(withVat(10_730, 26)).toEqual({ netCents: 10_730, vatCents: 2_790, grossCents: 13_520 });
  });

  it('rounds a half cent of VAT up: 2 × 25.5 % = 0.51 → 1, 1 × 25.5 % = 0.255 → 0', () => {
    expect(withVat(2, 25.5).vatCents).toBe(1);
    expect(withVat(1, 25.5).vatCents).toBe(0);
  });

  it('charges no VAT on zero', () => {
    expect(withVat(0, 26)).toEqual({ netCents: 0, vatCents: 0, grossCents: 0 });
  });

  it('throws on fractional cents, which are a bug', () => {
    expect(() => withVat(10.5, 25.5)).toThrow(RangeError);
  });
});
