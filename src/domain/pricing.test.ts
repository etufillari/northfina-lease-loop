import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadPriceLists } from '@/data/load';
import type { CoefficientTable, PriceList } from '@/data/schemas';
import { calculateQuote, quoteFromPriceList } from './pricing';

let table: CoefficientTable;
let priceLists: PriceList[];
beforeAll(async () => {
  [table, priceLists] = await Promise.all([loadCoefficientTable(), loadPriceLists()]);
});

const quote = (listPriceCents: number, downPaymentCents: number, termMonths: number) => {
  const result = calculateQuote(table, { listPriceCents, downPaymentCents, termMonths });
  if (!result.ok) throw new Error(result.reason);
  return result.quote;
};

describe('calculateQuote', () => {
  it('reproduces the worked example in data/DATA.md', () => {
    expect(quote(389_000, 0, 36)).toEqual({
      listPriceCents: 389_000,
      downPaymentCents: 0,
      termMonths: 36,
      financedCents: 389_000,
      band: 'B',
      monthlyFactor: 0.027584,
      annualInterestPercent: 7.9,
      monthlyNetRentCents: 10_730,
      buyoutPercent: 15,
      buyoutNetCents: 58_350,
      contractNetTotalCents: 386_280,
    });
  });

  it('subtracts the down payment before picking the band', () => {
    const big = quote(14_500_000, 2_000_000, 48);
    expect(big).toMatchObject({ financedCents: 12_500_000, band: 'D' });
  });

  it('includes the down payment in the contract total but not the buyout', () => {
    const big = quote(14_500_000, 2_000_000, 48);
    expect(big.monthlyNetRentCents).toBe(272_038);
    expect(big.contractNetTotalCents).toBe(2_000_000 + 48 * 272_038);
  });

  it('prices the two laptops on either side of the band boundary differently', () => {
    expect(quote(199_999, 0, 36)).toMatchObject({ band: 'A', monthlyNetRentCents: 5725 });
    expect(quote(200_000, 0, 36)).toMatchObject({ band: 'B', monthlyNetRentCents: 5517 });
  });

  it('shows that a tiny down payment can raise the rent by changing the band', () => {
    expect(quote(200_000, 1, 36).monthlyNetRentCents).toBeGreaterThan(
      quote(200_000, 0, 36).monthlyNetRentCents
    );
  });

  it('accepts the lowest and highest amounts that can be financed', () => {
    expect(quote(30_000, 0, 12).band).toBe('A');
    expect(quote(25_000_000, 0, 48).band).toBe('D');
    expect(quote(5_030_000, 5_000_000, 24).financedCents).toBe(30_000);
  });

  it('makes a too-expensive item leasable with a big enough down payment', () => {
    const request = { listPriceCents: 26_000_000, termMonths: 48 };
    expect(calculateQuote(table, { ...request, downPaymentCents: 999_999 })).toEqual({
      ok: false,
      reason: 'above_maximum',
    });
    expect(calculateQuote(table, { ...request, downPaymentCents: 1_000_000 }).ok).toBe(true);
  });

  it.each([
    [28_900, 0, 36, 'below_minimum'],
    [389_000, 389_000, 36, 'below_minimum'],
    [389_000, 359_001, 36, 'below_minimum'],
    [26_000_000, 0, 36, 'above_maximum'],
    [389_000, 0, 18, 'unknown_term'],
    [389_000, 389_001, 36, 'down_payment_exceeds_price'],
  ])('answers %i with %i down over %i months with %s', (price, down, term, reason) => {
    expect(
      calculateQuote(table, { listPriceCents: price, downPaymentCents: down, termMonths: term })
    ).toEqual({ ok: false, reason });
  });

  it('reports a term that has a factor but no buyout as unknown', () => {
    const noBuyout = { ...table, end_of_term_buyout_percent_of_financed: {} };
    expect(
      calculateQuote(noBuyout, { listPriceCents: 389_000, downPaymentCents: 0, termMonths: 36 })
    ).toEqual({ ok: false, reason: 'unknown_term' });
  });

  it('throws on fractions of a cent and negative amounts', () => {
    const base = { downPaymentCents: 0, termMonths: 36 };
    expect(() => calculateQuote(table, { ...base, listPriceCents: 1.5 })).toThrow(RangeError);
    expect(() =>
      calculateQuote(table, { ...base, listPriceCents: 389_000, downPaymentCents: -1 })
    ).toThrow(RangeError);
  });
});

describe('quoteFromPriceList', () => {
  const request = { assetId: 'laptop-004', downPaymentCents: 0, termMonths: 36 };

  it('uses v1 on its last day and v2 on its first day', () => {
    expect(
      quoteFromPriceList(priceLists, table, { ...request, onDate: '2026-11-05' })
    ).toMatchObject({
      ok: true,
      quote: { priceListVersion: 1, listPriceCents: 349_000, quotedOn: '2026-11-05' },
    });
    expect(
      quoteFromPriceList(priceLists, table, { ...request, onDate: '2026-11-06' })
    ).toMatchObject({
      ok: true,
      quote: { priceListVersion: 2, listPriceCents: 321_100, monthlyNetRentCents: 8857 },
    });
  });

  it('follows an item across the minimum and across a band when the list changes', () => {
    const on = (assetId: string, onDate: string) =>
      quoteFromPriceList(priceLists, table, {
        assetId,
        onDate,
        downPaymentCents: 0,
        termMonths: 24,
      });
    expect(on('ebike-010', '2026-11-05')).toEqual({ ok: false, reason: 'below_minimum' });
    expect(on('ebike-010', '2026-11-06')).toMatchObject({ ok: true, quote: { band: 'A' } });
    expect(on('laptop-003', '2026-11-05')).toMatchObject({ ok: true, quote: { band: 'B' } });
    expect(on('laptop-003', '2026-11-06')).toMatchObject({ ok: true, quote: { band: 'A' } });
  });

  it('passes on the reason when the asset or the date has no price', () => {
    expect(
      quoteFromPriceList(priceLists, table, { ...request, assetId: 'nope', onDate: '2026-11-05' })
    ).toEqual({ ok: false, reason: 'unknown_asset' });
    expect(quoteFromPriceList(priceLists, table, { ...request, onDate: '2025-12-31' })).toEqual({
      ok: false,
      reason: 'no_price_list_on_date',
    });
  });
});
