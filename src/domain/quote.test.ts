import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadPriceLists } from '@/data/load';
import type { CoefficientTable, PriceList } from '@/data/schemas';
import { makeQuote } from './quote';

let table: CoefficientTable;
let priceLists: PriceList[];
beforeAll(async () => {
  [table, priceLists] = await Promise.all([loadCoefficientTable(), loadPriceLists()]);
});

describe('makeQuote', () => {
  it('prices from the list valid on the quote date and records where every number came from', () => {
    // laptop-004 on Thu 5 Nov: price list v1, 349 000. 36 m band B: 349 000 × 0.027584 = 9 626.8 → 9 627.
    const result = makeQuote(priceLists, table, {
      assetId: 'laptop-004',
      quoteDate: '2026-11-05',
      termMonths: 36,
      downPaymentCents: 0,
    });
    expect(result).toMatchObject({
      ok: true,
      quote: {
        assetId: 'laptop-004',
        quoteDate: '2026-11-05',
        validUntil: '2026-11-12',
        priceListVersion: 1,
        coefficientTableId: 'ct-2026-1',
        listPriceCents: 349_000,
        monthlyNetRentCents: 9_627,
      },
    });
  });

  it('uses price list v2 from Fri 6 Nov: laptops 8 % cheaper', () => {
    // v2: 321 100. 321 100 × 0.027584 = 8 857.2 → 8 857.
    const result = makeQuote(priceLists, table, {
      assetId: 'laptop-004',
      quoteDate: '2026-11-06',
      termMonths: 36,
      downPaymentCents: 0,
    });
    expect(result).toMatchObject({
      ok: true,
      quote: { priceListVersion: 2, listPriceCents: 321_100, monthlyNetRentCents: 8_857 },
    });
  });

  it('passes on why an item cannot be priced', () => {
    const quote = (assetId: string, quoteDate: string) =>
      makeQuote(priceLists, table, { assetId, quoteDate, termMonths: 24, downPaymentCents: 0 });
    expect(quote('no-such-asset', '2026-11-05')).toEqual({ ok: false, reason: 'unknown_asset' });
    expect(quote('laptop-004', '2025-12-31')).toEqual({
      ok: false,
      reason: 'no_price_list_on_date',
    });
    expect(quote('ebike-010', '2026-11-05')).toEqual({ ok: false, reason: 'below_minimum' });
  });
});
