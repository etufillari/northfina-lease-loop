import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { vatRateOn } from './vat';

let vatRates: VatRates;

beforeAll(async () => {
  vatRates = await loadVatRates();
});

describe('vatRateOn', () => {
  it('returns 25.5 % (2550 bp) on 2026-11-05 and 2026-12-31', () => {
    const expected = { ok: true, ratePercent: 25.5, rateBp: 2_550, fictional: false };
    expect(vatRateOn(vatRates, '2026-11-05')).toEqual(expected);
    expect(vatRateOn(vatRates, '2026-12-31')).toEqual(expected);
  });

  it('switches to the fictional 26.0 % (2600 bp) rate on 2027-01-01', () => {
    expect(vatRateOn(vatRates, '2027-01-01')).toEqual({
      ok: true,
      ratePercent: 26.0,
      rateBp: 2_600,
      fictional: true,
    });
  });

  it('returns no_vat_rate_on_date before the earliest rate', () => {
    expect(vatRateOn(vatRates, '2010-01-01')).toEqual({
      ok: false,
      reason: 'no_vat_rate_on_date',
    });
  });

  it('throws on malformed or impossible dates', () => {
    expect(() => vatRateOn(vatRates, '05-11-2026')).toThrow(RangeError);
    expect(() => vatRateOn(vatRates, '2026-02-30')).toThrow(RangeError);
  });
});
