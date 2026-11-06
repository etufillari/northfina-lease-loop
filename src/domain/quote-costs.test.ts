import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import type { CoefficientTable, PriceList, VatRates } from '@/data/schemas';
import { quoteFromPriceList } from './pricing';
import { priceQuote } from './quote-costs';

let table: CoefficientTable;
let priceLists: PriceList[];
let vatRates: VatRates;
beforeAll(async () => {
  [table, priceLists, vatRates] = await Promise.all([
    loadCoefficientTable(),
    loadPriceLists(),
    loadVatRates(),
  ]);
});

const assetQuote = (assetId: string, onDate: string, downPaymentCents: number, term: number) => {
  const result = quoteFromPriceList(priceLists, table, {
    assetId,
    onDate,
    downPaymentCents,
    termMonths: term,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.quote;
};

const priced = (assetId: string, onDate: string, downPaymentCents: number, term: number) => {
  const result = priceQuote(assetQuote(assetId, onDate, downPaymentCents, term), vatRates);
  if (!result.ok) throw new Error(result.reason);
  return result.quote;
};

describe('priceQuote', () => {
  it('reproduces the worked example in data/DATA.md', () => {
    expect(priced('ebike-003', '2026-11-05', 0, 36).firstRent).toMatchObject({
      netCents: 10_730,
      vatCents: 2_736,
      grossCents: 13_466,
      vatRatePercent: 25.5,
    });
  });

  it('keeps every field of the quote', () => {
    const quote = assetQuote('ebike-003', '2026-11-05', 0, 36);
    const result = priceQuote(quote, vatRates);
    expect(result).toMatchObject({ ok: true, quote });
  });

  it('skips the down payment when choosing the first rent', () => {
    const quote = priced('ebike-003', '2026-11-05', 50_000, 36);
    expect(quote.firstRent.netCents).toBe(quote.monthlyNetRentCents);
  });

  it('counts the down payment in the totals', () => {
    const quote = priced('ebike-003', '2026-11-05', 50_000, 36);
    expect(quote.totals.netCents).toBe(quote.contractNetTotalCents);
  });

  it('uses the VAT rate of each month, not only the first', () => {
    const quote = priced('ebike-003', '2026-11-05', 0, 12);
    const atFirstRate = quote.firstRent.grossCents * 12;
    expect(quote.totals.grossCents).toBeGreaterThan(atFirstRate);
  });

  it('adds the buyout with VAT to the total with buyout', () => {
    const quote = priced('ebike-003', '2026-11-05', 0, 36);
    expect(quote.totalWithBuyoutGrossCents).toBe(quote.totals.grossCents + quote.buyout.grossCents);
  });

  it('reports the date that has no VAT rate', () => {
    const noRates: VatRates = { ...vatRates, rates: [] };
    const quote = assetQuote('ebike-003', '2026-11-05', 0, 36);
    expect(priceQuote(quote, noRates)).toEqual({
      ok: false,
      reason: 'no_vat_rate_on_date',
      date: '2026-11-05',
    });
  });
});
