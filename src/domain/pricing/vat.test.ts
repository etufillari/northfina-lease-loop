import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { vatOn } from './vat';

let vatRates: VatRates;

beforeAll(async () => {
  vatRates = await loadVatRates();
});

describe('vatOn', () => {
  it('calculates the documented monthly VAT example', () => {
    expect(vatOn(vatRates, 10_730, '2026-11-05')).toEqual({
      ok: true,
      netAmountCents: 10_730,
      ratePercent: 25.5,
      vatCents: 2_736,
      grossCents: 13_466,
    });
  });

  it('uses the 25.5% rate through 2026-12-31', () => {
    expect(vatOn(vatRates, 10_730, '2026-12-31')).toMatchObject({
      ok: true,
      ratePercent: 25.5,
    });
  });

  it('switches to 26% on 2027-01-01', () => {
    expect(vatOn(vatRates, 10_730, '2027-01-01')).toEqual({
      ok: true,
      netAmountCents: 10_730,
      ratePercent: 26,
      vatCents: 2_790,
      grossCents: 13_520,
    });
  });

  it('handles zero and rounds VAT once to the nearest cent', () => {
    expect(vatOn(vatRates, 0, '2026-11-05')).toMatchObject({
      ok: true,
      vatCents: 0,
      grossCents: 0,
    });

    const halfCentRate: VatRates = {
      ...vatRates,
      rates: [{ rate_percent: 0.005, valid_from: '2026-01-01', valid_to: null }],
    };
    expect(vatOn(halfCentRate, 10_000, '2026-11-05')).toMatchObject({
      ok: true,
      vatCents: 1,
      grossCents: 10_001,
    });
  });

  it('reports dates before the first configured rate', () => {
    expect(vatOn(vatRates, 10_000, '2012-12-31')).toEqual({
      ok: false,
      reason: 'no_rate_on_date',
    });
  });

  it('throws for malformed dates and invalid money', () => {
    expect(() => vatOn(vatRates, 10_000, '6.11.2026')).toThrow(RangeError);
    expect(() => vatOn(vatRates, 10_000, '2026-02-30')).toThrow(RangeError);
    expect(() => vatOn(vatRates, 10_000, '2026-13-01')).toThrow(RangeError);
    expect(() => vatOn(vatRates, 10_000.5, '2026-11-05')).toThrow(RangeError);
    expect(() => vatOn(vatRates, -1, '2026-11-05')).toThrow(RangeError);
  });

  it('accepts a valid leap-day date', () => {
    expect(vatOn(vatRates, 10_000, '2028-02-29')).toMatchObject({
      ok: true,
      ratePercent: 26,
    });
  });
});
