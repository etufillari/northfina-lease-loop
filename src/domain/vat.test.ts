import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { grossCents, vatCents, vatRateOn } from './vat';

let vatRates: VatRates;
beforeAll(async () => {
  vatRates = await loadVatRates();
});

describe('vatRateOn', () => {
  it('finds 25.5 % up to the last day of 2026', () => {
    expect(vatRateOn(vatRates, '2026-11-05')).toMatchObject({ ok: true, ratePercent: 25.5 });
    expect(vatRateOn(vatRates, '2026-12-31')).toMatchObject({
      ok: true,
      rateBasisPoints: 2550,
      fictional: false,
    });
  });

  it('switches to the fictional 26 % on 1 Jan 2027', () => {
    expect(vatRateOn(vatRates, '2027-01-01')).toEqual({
      ok: true,
      ratePercent: 26,
      rateBasisPoints: 2600,
      fictional: true,
    });
  });

  it('includes both ends of the older ranges', () => {
    expect(vatRateOn(vatRates, '2024-08-31')).toMatchObject({ ok: true, ratePercent: 24 });
    expect(vatRateOn(vatRates, '2024-09-01')).toMatchObject({ ok: true, ratePercent: 25.5 });
  });

  it('answers with a reason before the first known rate', () => {
    expect(vatRateOn(vatRates, '2012-12-31')).toEqual({ ok: false, reason: 'no_vat_rate_on_date' });
  });
});

describe('vatCents', () => {
  it('matches the worked example: 25.5 % of 107.30 € is 27.36 € (scenario card 1)', () => {
    expect(vatCents(10730, 2550)).toBe(2736); // 2736.15 rounds down
    expect(grossCents(10730, 2550)).toBe(13466);
  });

  it('rounds half-up per invoice', () => {
    expect(vatCents(2, 2500)).toBe(1); // 0.5 cents rounds up
    expect(vatCents(2, 2550)).toBe(1); // 0.51
    expect(vatCents(1, 2400)).toBe(0); // 0.24
  });

  it('is exact when no rounding is needed', () => {
    expect(vatCents(200, 2550)).toBe(51);
    expect(vatCents(10000, 2600)).toBe(2600);
  });
});
