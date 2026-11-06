import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadPriceLists } from '@/data/load';
import type { CoefficientTable, PriceList } from '@/data/schemas';
import { calculatePrice, quoteOn } from './pricing';

let table: CoefficientTable;
let priceLists: PriceList[];
beforeAll(async () => {
  [table, priceLists] = await Promise.all([loadCoefficientTable(), loadPriceLists()]);
});

describe('price terms', () => {
  it('matches the independent worked example and sums fixed rounded instalments', () => {
    expect(
      calculatePrice({ listPriceCents: 389000, downPaymentCents: 0, termMonths: 36, table })
    ).toEqual({
      ok: true,
      terms: {
        listPriceCents: 389000,
        downPaymentCents: 0,
        financedCents: 389000,
        termMonths: 36,
        coefficientTableId: 'ct-2026-1',
        coefficientTableVersion: 1,
        band: 'B',
        factorMillionths: 27584,
        monthlyNetCents: 10730,
        buyoutNetCents: 58350,
        totalRentNetCents: 386280,
      },
    });
  });

  it.each([
    [12, 21317, 255804, 155600],
    [24, 13822, 331728, 97250],
    [48, 8925, 428400, 31120],
  ])('prices the supported %s-month term', (termMonths, monthly, total, buyout) => {
    expect(
      calculatePrice({ listPriceCents: 389000, downPaymentCents: 0, termMonths, table })
    ).toMatchObject({
      ok: true,
      terms: { monthlyNetCents: monthly, totalRentNetCents: total, buyoutNetCents: buyout },
    });
  });

  it('selects the band after subtracting the down payment', () => {
    const result = calculatePrice({
      listPriceCents: 200000,
      downPaymentCents: 1,
      termMonths: 36,
      table,
    });
    expect(result).toMatchObject({
      ok: true,
      terms: { financedCents: 199999, band: 'A', monthlyNetCents: 5725 },
    });
    // A one-cent down payment can increase rent when it moves the deal into a different band.
    expect(
      calculatePrice({ listPriceCents: 200000, downPaymentCents: 0, termMonths: 36, table })
    ).toMatchObject({
      ok: true,
      terms: { band: 'B', monthlyNetCents: 5517 },
    });
  });

  it.each([
    [30000, 24, 'A', 1099, 26376, 7500],
    [25000000, 48, 'D', 544075, 26115600, 2000000],
  ])('accepts the exact financing boundary %s', (price, term, band, monthly, total, buyout) => {
    expect(
      calculatePrice({ listPriceCents: price, downPaymentCents: 0, termMonths: term, table })
    ).toMatchObject({
      ok: true,
      terms: { band, monthlyNetCents: monthly, totalRentNetCents: total, buyoutNetCents: buyout },
    });
  });

  it('keeps the advance outside rent and buyout totals and rounds a half-cent upwards', () => {
    expect(
      calculatePrice({
        listPriceCents: 14500000,
        downPaymentCents: 2000000,
        termMonths: 48,
        table,
      })
    ).toMatchObject({
      ok: true,
      terms: {
        financedCents: 12500000,
        band: 'D',
        monthlyNetCents: 272038,
        totalRentNetCents: 13057824,
        buyoutNetCents: 1000000,
      },
    });
  });

  it.each([
    [29999, 0, 24, 'below_minimum'],
    [25000001, 0, 24, 'above_maximum'],
    [100000, 100000, 24, 'below_minimum'],
    [100000, 70001, 24, 'below_minimum'],
    [0, 0, 24, 'below_minimum'],
    [100000, -1, 24, 'invalid_down_payment'],
    [100000, 100001, 24, 'invalid_down_payment'],
    [100000, 0.5, 24, 'invalid_down_payment'],
    [100000, Number.NaN, 24, 'invalid_down_payment'],
    [100000, Number.POSITIVE_INFINITY, 24, 'invalid_down_payment'],
    [100000, 0, 0, 'invalid_term'],
    [100000, 0, -1, 'invalid_term'],
    [100000, 0, 24.5, 'invalid_term'],
    [100000, 0, Number.NaN, 'invalid_term'],
    [100000, 0, Number.MAX_SAFE_INTEGER + 1, 'invalid_term'],
    [100000, 0, 18, 'unknown_term'],
  ])(
    'rejects price %s, advance %s and term %s with %s',
    (listPriceCents, downPaymentCents, termMonths, reason) => {
      expect(calculatePrice({ listPriceCents, downPaymentCents, termMonths, table })).toEqual({
        ok: false,
        reason,
      });
    }
  );

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'throws for invalid list price %s supplied by the caller',
    (listPriceCents) => {
      expect(() =>
        calculatePrice({ listPriceCents, downPaymentCents: 0, termMonths: 24, table })
      ).toThrow(RangeError);
    }
  );

  it('reports unsupported buyout terms rather than inventing a price', () => {
    const missingBuyout = { ...table, end_of_term_buyout_percent_of_financed: {} };
    expect(
      calculatePrice({
        listPriceCents: 100000,
        downPaymentCents: 0,
        termMonths: 24,
        table: missingBuyout,
      })
    ).toEqual({ ok: false, reason: 'unknown_term' });
  });

  it('accepts an explicitly zero buyout percentage', () => {
    expect(
      calculatePrice({
        listPriceCents: 100000,
        downPaymentCents: 0,
        termMonths: 24,
        table: { ...table, end_of_term_buyout_percent_of_financed: { '24': 0 } },
      })
    ).toMatchObject({ ok: true, terms: { buyoutNetCents: 0 } });
  });
});

describe('dated catalogue price', () => {
  it('uses exact v1/v2 data literals, leaving an earlier result unchanged', () => {
    const input = { assetId: 'laptop-004', downPaymentCents: 0, termMonths: 24, table, priceLists };
    const earlier = quoteOn({ ...input, isoDate: '2026-11-05' });
    const snapshot = structuredClone(earlier);
    const later = quoteOn({ ...input, isoDate: '2026-11-06' });
    expect(earlier).toMatchObject({
      ok: true,
      terms: {
        assetId: 'laptop-004',
        listPriceCents: 349000,
        priceListVersion: 1,
        pricedOn: '2026-11-05',
      },
    });
    expect(later).toMatchObject({
      ok: true,
      terms: { listPriceCents: 321100, priceListVersion: 2, pricedOn: '2026-11-06' },
    });
    expect(earlier).toEqual(snapshot);
  });

  it('accepts the exact first valid date without mutating the source data', () => {
    const before = structuredClone({ table, priceLists });
    expect(
      quoteOn({
        assetId: 'laptop-004',
        isoDate: '2026-01-01',
        downPaymentCents: 0,
        termMonths: 24,
        table,
        priceLists,
      })
    ).toMatchObject({ ok: true, terms: { priceListVersion: 1, pricedOn: '2026-01-01' } });
    expect({ table, priceLists }).toEqual(before);
  });

  it('fails safely for missing price, future coefficients and malformed dates', () => {
    const input = {
      assetId: 'missing',
      isoDate: '2026-11-05',
      downPaymentCents: 0,
      termMonths: 24,
      table,
      priceLists,
    };
    expect(quoteOn(input)).toEqual({ ok: false, reason: 'unknown_asset' });
    expect(quoteOn({ ...input, priceLists: [] })).toEqual({
      ok: false,
      reason: 'no_price_list_on_date',
    });
    expect(quoteOn({ ...input, isoDate: '2025-12-31' })).toEqual({
      ok: false,
      reason: 'table_not_yet_valid',
    });
    expect(() => quoteOn({ ...input, isoDate: '2026-02-29' })).toThrow(RangeError);
    expect(() => quoteOn({ ...input, isoDate: '2026-11-05\n' })).toThrow(RangeError);
    expect(quoteOn({ ...input, assetId: 'laptop-004', downPaymentCents: -1 })).toEqual({
      ok: false,
      reason: 'invalid_down_payment',
    });
  });
});
