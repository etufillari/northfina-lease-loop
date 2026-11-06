import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { vatAmounts, vatRateOn } from './vat';

let vatRates: VatRates;
beforeAll(async () => {
  vatRates = await loadVatRates();
});

describe('vatRateOn', () => {
  it('uses both ends of a rate period', () => {
    expect(vatRateOn(vatRates, '2024-09-01')).toEqual({ ok: true, ratePercent: 25.5 });
    expect(vatRateOn(vatRates, '2026-12-31')).toEqual({ ok: true, ratePercent: 25.5 });
  });

  it('switches on the first day of the new rate and keeps it with no end date', () => {
    expect(vatRateOn(vatRates, '2027-01-01')).toEqual({ ok: true, ratePercent: 26 });
    expect(vatRateOn(vatRates, '2099-06-15')).toEqual({ ok: true, ratePercent: 26 });
  });

  it('answers with a reason when no rate covers the date', () => {
    expect(vatRateOn(vatRates, '2012-12-31')).toEqual({
      ok: false,
      reason: 'no_vat_rate_on_date',
    });
  });

  it('throws on a date that does not exist', () => {
    expect(() => vatRateOn(vatRates, '2026-02-30')).toThrow(RangeError);
  });
});

describe('vatAmounts', () => {
  it('returns net, rate, VAT and gross for the worked example', () => {
    expect(vatAmounts(10_730, 25.5)).toEqual({
      netCents: 10_730,
      vatRatePercent: 25.5,
      vatCents: 2736,
      grossCents: 13_466,
    });
  });

  it('gives a higher gross, not a higher net, after the rate change', () => {
    expect(vatAmounts(10_730, 26)).toMatchObject({ netCents: 10_730, grossCents: 13_520 });
  });

  it('is all zero for a zero amount', () => {
    expect(vatAmounts(0, 26)).toMatchObject({ vatCents: 0, grossCents: 0 });
  });
});
