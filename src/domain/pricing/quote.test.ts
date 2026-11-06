import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadAssets,
  loadCoefficientTable,
  loadPriceLists,
  loadTermLimits,
  loadVatRates,
} from '@/data/load';
import { buildSchedule, scheduleTotals } from '../invoicing/schedule';
import { breakdownFromFrozen, priceQuote, type PricingData } from './quote';

// Against the real data pack, so a changed data file fails the pinned card numbers.
let data: PricingData;
beforeAll(async () => {
  data = {
    priceLists: await loadPriceLists(),
    table: await loadCoefficientTable(),
    vatRates: await loadVatRates(),
    termLimits: await loadTermLimits(),
    assets: await loadAssets(),
  };
});

const base = { downPaymentCents: 0, isoDate: '2026-11-05' };

function quoteOf(input: Parameters<typeof priceQuote>[1]) {
  const result = priceQuote(data, input);
  if (!result.ok) throw new Error(`expected a quote, got ${result.reason.code}`);
  return result.quote;
}

describe('priceQuote, card 1 (the worked example: ebike-003, 36 months, no down payment)', () => {
  it('reproduces every line of the worked example', () => {
    const quote = quoteOf({ ...base, assetId: 'ebike-003', termMonths: 36 });
    expect(quote).toMatchObject({
      priceListVersion: 1,
      unitListPriceCents: 389_000,
      listPriceCents: 389_000,
      downPaymentCents: 0,
      financedCents: 389_000,
      band: 'B',
      factorMillionths: 27_584,
      monthlyNetCents: 10_730,
      vatRateBasisPoints: 2550,
      monthlyVatCents: 2736,
      monthlyGrossCents: 13_466,
      buyoutPercentBasisPoints: 1500,
      buyoutCents: 58_350,
    });
  });

  it('gives the total cost two ways (D6): 36 × 13 466 if you return, plus the gross buyout if you buy', () => {
    const quote = quoteOf({ ...base, assetId: 'ebike-003', termMonths: 36 });
    expect(quote.totalIfReturnCents).toBe(36 * 13_466);
    // The buyout carries VAT like every invoice line: 58 350 × 25.5 % = 14 879.25 → 14 879.
    expect(quote).toMatchObject({ buyoutVatCents: 14_879, buyoutGrossCents: 73_229 });
    expect(quote.totalIfBuyCents).toBe(36 * 13_466 + 73_229);
    expect(quote.vatIsEstimate).toBe(true);
  });

  it('adds the down payment with its VAT to both totals', () => {
    const quote = quoteOf({
      ...base,
      assetId: 'ebike-003',
      termMonths: 36,
      downPaymentCents: 89_000,
    });
    expect(quote.financedCents).toBe(300_000);
    // 89 000 × 25.5 % = 22 695: the down payment is invoiced with VAT (invoice 0, D5).
    expect(quote).toMatchObject({ downPaymentVatCents: 22_695, downPaymentGrossCents: 111_695 });
    expect(quote.totalIfReturnCents).toBe(111_695 + 36 * quote.monthlyGrossCents);
    expect(quote.totalIfBuyCents).toBe(quote.totalIfReturnCents + quote.buyoutGrossCents);
  });
});

describe('priceQuote, card 2 (laptop-004 across the price-list change, band B, 36 months)', () => {
  it('prices on list v1 on 2026-11-05: 349 000 → 9 627', () => {
    const quote = quoteOf({ ...base, assetId: 'laptop-004', termMonths: 36 });
    expect(quote).toMatchObject({
      priceListVersion: 1,
      unitListPriceCents: 349_000,
      band: 'B',
      monthlyNetCents: 9627,
    });
  });

  it('prices on list v2 on 2026-11-06: 321 100 → 8 857', () => {
    const quote = quoteOf({
      ...base,
      assetId: 'laptop-004',
      termMonths: 36,
      isoDate: '2026-11-06',
    });
    expect(quote).toMatchObject({
      priceListVersion: 2,
      unitListPriceCents: 321_100,
      band: 'B',
      monthlyNetCents: 8857,
    });
  });
});

describe('priceQuote, the term cap per category (D43)', () => {
  it('refuses a laptop at 48 months with the code, the category and the cap', () => {
    const result = priceQuote(data, { ...base, assetId: 'laptop-004', termMonths: 48 });
    expect(result).toEqual({
      ok: false,
      reason: {
        code: 'term_over_category_max',
        params: { category: 'laptop', termMonths: 48, maxTermMonths: 36 },
      },
    });
  });

  it('still prices a laptop at 36 months (card 2) and a farm machine at 48 (card 7) as before', () => {
    expect(quoteOf({ ...base, assetId: 'laptop-004', termMonths: 36 }).monthlyNetCents).toBe(9627);
    const combine = quoteOf({
      ...base,
      assetId: 'farm-002',
      termMonths: 48,
      downPaymentCents: 2_000_000,
    });
    expect(combine).toMatchObject({ band: 'D', monthlyNetCents: 272_038 });
  });

  it('checks the cap after the term and the asset, before the money: a cheap laptop at 48 is over the cap, not below the band', () => {
    const cheap = {
      ...data,
      priceLists: [{ ...data.priceLists[0]!, prices: { 'laptop-004': 1000 } }],
    };
    const result = priceQuote(cheap, { ...base, assetId: 'laptop-004', termMonths: 48 });
    expect(result.ok === false && result.reason.code).toBe('term_over_category_max');
  });

  it('names the longest term the table offers under the cap: a cap of 40 says at most 36', () => {
    const limits = {
      ...data.termLimits,
      max_term_months: { ...data.termLimits.max_term_months, laptop: 40 },
    };
    const result = priceQuote(
      { ...data, termLimits: limits },
      { ...base, assetId: 'laptop-004', termMonths: 48 }
    );
    expect(result.ok === false && result.reason.params).toEqual({
      category: 'laptop',
      termMonths: 48,
      maxTermMonths: 36,
    });
  });

  it('refuses an asset the data has no category for', () => {
    const result = priceQuote(
      { ...data, assets: [] },
      { ...base, assetId: 'laptop-004', termMonths: 36 }
    );
    expect(result).toEqual({
      ok: false,
      reason: { code: 'unknown_asset', params: { assetId: 'laptop-004' } },
    });
  });
});

describe('priceQuote, card 6 (Norvi Logistics: one ebike-004, 36 months, D8)', () => {
  it('prices the one unique bike in band B: 549 000 financed, 15 144 a month', () => {
    const quote = quoteOf({ ...base, assetId: 'ebike-004', termMonths: 36 });
    expect(quote).toMatchObject({
      quantity: 1,
      unitListPriceCents: 549_000,
      listPriceCents: 549_000,
      financedCents: 549_000,
      band: 'B',
      factorMillionths: 27_584,
      monthlyNetCents: 15_144,
    });
  });

  it('ignores a quantity smuggled into the input: one item is one unit (D8)', () => {
    const input = { ...base, assetId: 'ebike-004', termMonths: 36, quantity: 4 };
    expect(quoteOf(input)).toMatchObject({ quantity: 1, financedCents: 549_000 });
  });
});

describe('priceQuote, card 7 (farm-002, 48 months, 2 000 000 down: the half cent)', () => {
  it('rounds 272 037.5 half up to 272 038 and buys out at 8 %', () => {
    const quote = quoteOf({
      ...base,
      assetId: 'farm-002',
      termMonths: 48,
      downPaymentCents: 2_000_000,
    });
    expect(quote).toMatchObject({
      listPriceCents: 14_500_000,
      financedCents: 12_500_000,
      band: 'D',
      factorMillionths: 21_763,
      monthlyNetCents: 272_038,
      buyoutCents: 1_000_000,
    });
  });

  it('puts VAT on the 2 000 000 down payment and the buyout in the totals', () => {
    const quote = quoteOf({
      ...base,
      assetId: 'farm-002',
      termMonths: 48,
      downPaymentCents: 2_000_000,
    });
    expect(quote).toMatchObject({
      downPaymentVatCents: 510_000,
      downPaymentGrossCents: 2_510_000,
      buyoutVatCents: 255_000,
      buyoutGrossCents: 1_255_000,
    });
    expect(quote.totalIfReturnCents).toBe(2_510_000 + 48 * quote.monthlyGrossCents);
    expect(quote.totalIfBuyCents).toBe(quote.totalIfReturnCents + 1_255_000);
  });
});

describe('priceQuote, the traps', () => {
  it('keeps laptop-002 at 199 999 in band A and puts laptop-003 at 200 000 in band B', () => {
    expect(quoteOf({ ...base, assetId: 'laptop-002', termMonths: 24 }).band).toBe('A');
    expect(quoteOf({ ...base, assetId: 'laptop-003', termMonths: 24 }).band).toBe('B');
  });

  it('refuses ebike-010, below the lowest band, with the minimum as a param', () => {
    const result = priceQuote(data, { ...base, assetId: 'ebike-010', termMonths: 12 });
    expect(result).toEqual({
      ok: false,
      reason: { code: 'below_minimum', params: { financedCents: 28_900, minimumCents: 30_000 } },
    });
  });

  it('refuses farm-006, above the highest band, with the maximum as a param', () => {
    const result = priceQuote(data, { ...base, assetId: 'farm-006', termMonths: 48 });
    expect(result).toEqual({
      ok: false,
      reason: {
        code: 'above_maximum',
        params: { financedCents: 26_000_000, maximumCents: 25_000_000 },
      },
    });
  });

  it('lets a down payment bring farm-006 back into band D', () => {
    const quote = quoteOf({
      ...base,
      assetId: 'farm-006',
      termMonths: 48,
      downPaymentCents: 1_000_000,
    });
    expect(quote).toMatchObject({ financedCents: 25_000_000, band: 'D' });
  });

  it('refuses a down payment equal to the price (nothing left to finance)', () => {
    const result = priceQuote(data, {
      ...base,
      assetId: 'ebike-003',
      termMonths: 36,
      downPaymentCents: 389_000,
    });
    expect(result).toEqual({
      ok: false,
      reason: {
        code: 'down_payment_too_high',
        params: { downPaymentCents: 389_000, listPriceCents: 389_000 },
      },
    });
  });

  it('refuses a negative or fractional down payment', () => {
    for (const downPaymentCents of [-1, 0.5]) {
      const result = priceQuote(data, {
        ...base,
        assetId: 'ebike-003',
        termMonths: 36,
        downPaymentCents,
      });
      expect(result).toEqual({
        ok: false,
        reason: { code: 'invalid_down_payment', params: { downPaymentCents } },
      });
    }
  });

  it('refuses a term the table does not have and lists the ones it does', () => {
    const result = priceQuote(data, { ...base, assetId: 'ebike-003', termMonths: 30 });
    expect(result).toEqual({
      ok: false,
      reason: { code: 'unknown_term', params: { termMonths: 30, terms: [12, 24, 36, 48] } },
    });
  });

  it('refuses an asset with no price', () => {
    const result = priceQuote(data, { ...base, assetId: 'rocket-001', termMonths: 36 });
    expect(result).toEqual({
      ok: false,
      reason: { code: 'unknown_asset', params: { assetId: 'rocket-001' } },
    });
  });

  it('refuses a day no price list covers', () => {
    const result = priceQuote(data, {
      ...base,
      assetId: 'ebike-003',
      termMonths: 36,
      isoDate: '2025-12-31',
    });
    expect(result).toEqual({
      ok: false,
      reason: { code: 'no_price_list_on_date', params: { isoDate: '2025-12-31' } },
    });
  });

  it('refuses a day with no VAT rate (substituted data)', () => {
    const result = priceQuote(
      { ...data, vatRates: { ...data.vatRates, rates: [] } },
      { ...base, assetId: 'ebike-003', termMonths: 36 }
    );
    expect(result).toEqual({
      ok: false,
      reason: { code: 'no_vat_rate_on_date', params: { isoDate: '2026-11-05' } },
    });
  });

  it('uses the VAT rate of the quote date: 26 % in 2027 (fictional change)', () => {
    const quote = quoteOf({
      ...base,
      assetId: 'farm-002',
      termMonths: 48,
      isoDate: '2027-01-04',
    });
    expect(quote.vatRateBasisPoints).toBe(2600);
  });
});

describe('the quote total and the invoices (D6, review of PR #11)', () => {
  function scheduleGross(quote: ReturnType<typeof quoteOf>, signedOn: string) {
    const schedule = buildSchedule({
      signedOn,
      startDate: signedOn,
      termMonths: quote.termMonths,
      downPaymentCents: quote.downPaymentCents,
      monthlyNetCents: quote.monthlyNetCents,
      vatRates: data.vatRates,
    });
    if (!schedule.ok) throw new Error(schedule.reason);
    return scheduleTotals(schedule.invoices).grossCents;
  }

  it("the quote's total if you return it equals the sum of the invoicing schedule for the same contract", () => {
    // Card 7 dated in 2027, so all 49 invoices (down payment + 48 rents) fall in the open-ended 26 %.
    const quote = quoteOf({
      ...base,
      assetId: 'farm-002',
      termMonths: 48,
      downPaymentCents: 2_000_000,
      isoDate: '2027-01-04',
    });
    expect(quote.totalIfReturnCents).toBe(scheduleGross(quote, '2027-01-04'));
  });

  it('is an estimate when the lease crosses a VAT change: the invoices of card 7 from 2026-11-05 sum higher', () => {
    const quote = quoteOf({
      ...base,
      assetId: 'farm-002',
      termMonths: 48,
      downPaymentCents: 2_000_000,
    });
    expect(quote.vatIsEstimate).toBe(true);
    expect(scheduleGross(quote, '2026-11-05')).toBeGreaterThan(quote.totalIfReturnCents);
  });
});

describe('breakdownFromFrozen', () => {
  it('rebuilds the same breakdown from the stored numbers without the data pack', () => {
    const quote = quoteOf({ ...base, assetId: 'ebike-004', termMonths: 36 });
    expect(breakdownFromFrozen(quote)).toEqual(quote);
  });
});
