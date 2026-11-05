import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { vatCents, vatRateOn } from './vat';

let vatRates: VatRates;
beforeAll(async () => {
  vatRates = await loadVatRates();
});

describe('vatRateOn', () => {
  it('keeps 25.5 % on the last day of 2026 and moves to 26 % the next day', () => {
    expect(vatRateOn(vatRates, '2026-12-31')).toEqual({ ok: true, rateBasisPoints: 2550 });
    expect(vatRateOn(vatRates, '2027-01-01')).toEqual({ ok: true, rateBasisPoints: 2600 });
  });

  it('uses the open-ended rate for a date far in the future', () => {
    expect(vatRateOn(vatRates, '2040-06-15')).toEqual({ ok: true, rateBasisPoints: 2600 });
  });

  it('includes both ends of a closed range', () => {
    expect(vatRateOn(vatRates, '2024-09-01')).toEqual({ ok: true, rateBasisPoints: 2550 });
    expect(vatRateOn(vatRates, '2024-08-31')).toEqual({ ok: true, rateBasisPoints: 2400 });
  });

  it('reports a date before the first known rate', () => {
    expect(vatRateOn(vatRates, '2012-12-31')).toEqual({ ok: false, reason: 'no_vat_rate_on_date' });
  });
});

describe('vatCents', () => {
  it('matches the card 1 invoices before and after the VAT change', () => {
    expect(vatCents(10730, 2550)).toBe(2736);
    expect(vatCents(10730, 2600)).toBe(2790);
  });

  it('rounds an exact half up', () => {
    expect(vatCents(100, 2550)).toBe(26);
  });

  it('is zero on a zero amount or a zero rate', () => {
    expect(vatCents(0, 2550)).toBe(0);
    expect(vatCents(10730, 0)).toBe(0);
  });
});
