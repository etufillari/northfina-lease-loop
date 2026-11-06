import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { taxOn } from './vat';

let rates: VatRates;
beforeAll(async () => {
  rates = await loadVatRates();
});

describe('invoice-date VAT', () => {
  it.each([
    ['2013-01-01', 2400, 2575, 13305],
    ['2024-08-31', 2400, 2575, 13305],
    ['2024-09-01', 2550, 2736, 13466],
    ['2026-12-31', 2550, 2736, 13466],
    ['2027-01-01', 2600, 2790, 13520],
    ['2030-12-31', 2600, 2790, 13520],
  ])('taxes the same locked rent on %s', (date, vatBasisPoints, vatCents, grossCents) => {
    expect(taxOn(10730, date, rates)).toEqual({
      ok: true,
      amount: { netCents: 10730, vatBasisPoints, vatCents, grossCents },
    });
  });

  it('returns a missing rate without silently applying zero or the last known tax', () => {
    expect(taxOn(10730, '2012-12-31', rates)).toEqual({ ok: false, reason: 'no_vat_rate' });
    expect(taxOn(10730, '2026-11-05', { ...rates, rates: [] })).toEqual({
      ok: false,
      reason: 'no_vat_rate',
    });
    const gap = { ...rates, rates: rates.rates.filter((rate) => rate.rate_percent !== 25.5) };
    expect(taxOn(10730, '2026-11-05', gap)).toEqual({ ok: false, reason: 'no_vat_rate' });
  });

  it('keeps a zero net amount at zero while retaining the selected rate', () => {
    expect(taxOn(0, '2026-11-05', rates)).toEqual({
      ok: true,
      amount: { netCents: 0, vatBasisPoints: 2550, vatCents: 0, grossCents: 0 },
    });
  });

  it('accepts an explicit zero rate even for the maximum safe net amount', () => {
    const zeroRate = {
      ...rates,
      rates: [{ rate_percent: 0, valid_from: '2026-01-01', valid_to: null }],
    };
    expect(taxOn(Number.MAX_SAFE_INTEGER, '2026-11-05', zeroRate)).toEqual({
      ok: true,
      amount: {
        netCents: Number.MAX_SAFE_INTEGER,
        vatBasisPoints: 0,
        vatCents: 0,
        grossCents: Number.MAX_SAFE_INTEGER,
      },
    });
  });

  it.each([
    [1, 25, 2500, 0, 1],
    [2, 25, 2500, 1, 3],
    [3, 25, 2500, 1, 4],
    [10000, 25.55, 2555, 2555, 12555],
  ])('rounds tax on %s cents at %s percent once', (net, percent, basisPoints, vat, gross) => {
    const table = {
      ...rates,
      rates: [{ rate_percent: percent, valid_from: '2026-01-01', valid_to: null }],
    };
    expect(taxOn(net, '2026-11-05', table)).toEqual({
      ok: true,
      amount: { netCents: net, vatBasisPoints: basisPoints, vatCents: vat, grossCents: gross },
    });
  });

  it('rejects overlaps including a shared inclusive boundary', () => {
    const overlap = {
      ...rates,
      rates: [...rates.rates, { rate_percent: 25, valid_from: '2026-01-01', valid_to: null }],
    };
    expect(() => taxOn(10730, '2026-11-05', overlap)).toThrow('VAT date ranges overlap');
    const sharedBoundary = {
      ...rates,
      rates: [
        { rate_percent: 25.5, valid_from: '2026-01-01', valid_to: '2026-12-31' },
        { rate_percent: 26, valid_from: '2026-12-31', valid_to: null },
      ],
    };
    expect(() => taxOn(10730, '2026-12-31', sharedBoundary)).toThrow('VAT date ranges overlap');
  });

  it.each([-1, 0.1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid net cents: %s',
    (netCents) => expect(() => taxOn(netCents, '2026-11-05', rates)).toThrow(RangeError)
  );

  it.each(['2026-02-30', '2026-02-29', '2026-11-05\n', '05.11.2026', ''])(
    'rejects an invalid invoice date: %s',
    (date) => expect(() => taxOn(100, date, rates)).toThrow(RangeError)
  );

  it('rejects an unsafe gross total even when net and tax are individually safe', () => {
    expect(() => taxOn(Number.MAX_SAFE_INTEGER, '2026-11-05', rates)).toThrow(
      'gross amount exceeds safe integer cents'
    );
  });

  it('rejects a rate that cannot be represented exactly in basis points', () => {
    const tooPrecise = {
      ...rates,
      rates: [{ rate_percent: 25.555, valid_from: '2026-01-01', valid_to: null }],
    };
    expect(() => taxOn(10000, '2026-11-05', tooPrecise)).toThrow(RangeError);
  });

  it('does not change the table or an earlier result when pricing another invoice', () => {
    const originalRates = structuredClone(rates);
    const december = taxOn(10730, '2026-12-31', rates);
    const originalDecember = structuredClone(december);
    expect(taxOn(10730, '2027-01-01', rates)).toMatchObject({
      ok: true,
      amount: { netCents: 10730, grossCents: 13520 },
    });
    expect(december).toEqual(originalDecember);
    expect(rates).toEqual(originalRates);
  });
});
