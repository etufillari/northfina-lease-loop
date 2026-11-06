import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { vatRateOn } from './vat';

// The real data pack, so a changed rate file is caught here.
let rates: VatRates;
beforeAll(async () => {
  rates = await loadVatRates();
});

const twoRates: VatRates = {
  country: 'FI',
  note: 'test',
  rates: [
    { rate_percent: 10, valid_from: '2025-01-01', valid_to: '2025-06-30' },
    { rate_percent: 12.5, valid_from: '2025-07-01', valid_to: '2025-12-31' },
  ],
};

describe('vatRateOn', () => {
  it('gives 25.5 % on the last day of 2026', () => {
    expect(vatRateOn(rates, '2026-12-31')).toEqual({
      ok: true,
      rateBasisPoints: 2_550,
      percent: 25.5,
      validFrom: '2024-09-01',
    });
  });

  it('gives the fictional 26 % from 1 January 2027, open-ended', () => {
    expect(vatRateOn(rates, '2027-01-01')).toMatchObject({ ok: true, rateBasisPoints: 2_600 });
    expect(vatRateOn(rates, '2099-06-15')).toMatchObject({ ok: true, rateBasisPoints: 2_600 });
  });

  it('answers no_rate_on_date before the first rate', () => {
    expect(vatRateOn(rates, '2012-12-31')).toEqual({ ok: false, reason: 'no_rate_on_date' });
  });

  it('includes both ends of every range', () => {
    expect(vatRateOn(twoRates, '2025-01-01')).toMatchObject({ ok: true, rateBasisPoints: 1_000 });
    expect(vatRateOn(twoRates, '2025-06-30')).toMatchObject({ ok: true, rateBasisPoints: 1_000 });
    expect(vatRateOn(twoRates, '2025-07-01')).toMatchObject({ ok: true, rateBasisPoints: 1_250 });
    expect(vatRateOn(twoRates, '2025-12-31')).toMatchObject({ ok: true, rateBasisPoints: 1_250 });
    expect(vatRateOn(twoRates, '2026-01-01')).toEqual({ ok: false, reason: 'no_rate_on_date' });
    expect(vatRateOn(twoRates, '2024-12-31')).toEqual({ ok: false, reason: 'no_rate_on_date' });
  });

  it('throws on a malformed date', () => {
    expect(() => vatRateOn(rates, '2026-1-5')).toThrow(RangeError);
    expect(() => vatRateOn(rates, '05.01.2026')).toThrow(RangeError);
    expect(() => vatRateOn(rates, '')).toThrow(RangeError);
  });
});
