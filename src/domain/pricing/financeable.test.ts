import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadAssets,
  loadCoefficientTable,
  loadPriceLists,
  loadTermLimits,
  loadVatRates,
} from '@/data/load';
import { financeOffer } from './financeable';
import type { PricingData } from './quote';

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

const THURSDAY = '2026-11-05'; // price list 1
const FRIDAY = '2026-11-06'; // price list 2: e-bikes +5 %

describe('financeOffer', () => {
  it('gives the plain offer, one unit and nothing down, when that can be financed', () => {
    const offer = financeOffer(data, { assetId: 'ebike-003', termMonths: 36, isoDate: THURSDAY });
    expect(offer.kind).toBe('standard');
    expect(offer.kind === 'standard' && offer.quote.monthlyGrossCents).toBe(13_466);
  });

  it('refuses the kids bike at 289 € on price list 1: below the 300 € minimum, not leasable (D78)', () => {
    const offer = financeOffer(data, { assetId: 'ebike-010', termMonths: 36, isoDate: THURSDAY });
    expect(offer).toEqual({
      kind: 'none',
      reason: { code: 'below_minimum', params: { financedCents: 28_900, minimumCents: 30_000 } },
    });
  });

  it('never offers several units together: every item is unique (D8, D78)', () => {
    const tiny: PricingData = {
      ...data,
      priceLists: data.priceLists.map((list) => ({
        ...list,
        prices: { ...list.prices, 'ebike-010': 10_000 },
      })),
    };
    const offer = financeOffer(tiny, { assetId: 'ebike-010', termMonths: 36, isoDate: THURSDAY });
    expect(offer).toMatchObject({ kind: 'none', reason: { code: 'below_minimum' } });
  });

  it('gives the kids bike the plain offer on Friday, when price list 2 puts it at 303 €', () => {
    const offer = financeOffer(data, { assetId: 'ebike-010', termMonths: 36, isoDate: FRIDAY });
    expect(offer.kind).toBe('standard');
    expect(offer.kind === 'standard' && offer.quote.financedCents).toBe(30_300);
  });

  it('suggests 10 000 € down for the 260 000 € combine, leaving exactly the 250 000 € maximum', () => {
    const offer = financeOffer(data, { assetId: 'farm-006', termMonths: 48, isoDate: THURSDAY });
    expect(offer).toMatchObject({ kind: 'needs_down_payment', downPaymentCents: 1_000_000 });
    expect(offer.kind === 'needs_down_payment' && offer.quote.financedCents).toBe(25_000_000);
    expect(offer.kind === 'needs_down_payment' && offer.quote.band).toBe('D');
  });

  it('passes the refusal on when even the down-payment offer cannot be priced', () => {
    // No VAT rate on the day: the plain price is refused for the band first, and the offer
    // with the down payment is then refused for the missing rate.
    const noVat: PricingData = { ...data, vatRates: { ...data.vatRates, rates: [] } };
    const offer = financeOffer(noVat, { assetId: 'farm-006', termMonths: 48, isoDate: THURSDAY });
    expect(offer).toMatchObject({ kind: 'none', reason: { code: 'no_vat_rate_on_date' } });
  });

  it('passes the category cap through (D43): a laptop at 48 months is not offered', () => {
    expect(
      financeOffer(data, { assetId: 'laptop-004', termMonths: 48, isoDate: THURSDAY })
    ).toEqual({
      kind: 'none',
      reason: {
        code: 'term_over_category_max',
        params: { category: 'laptop', termMonths: 48, maxTermMonths: 36 },
      },
    });
  });

  it('passes other refusals through, such as an unknown asset or term', () => {
    expect(
      financeOffer(data, { assetId: 'nope', termMonths: 36, isoDate: THURSDAY })
    ).toMatchObject({ kind: 'none', reason: { code: 'unknown_asset' } });
    expect(
      financeOffer(data, { assetId: 'ebike-003', termMonths: 30, isoDate: THURSDAY })
    ).toMatchObject({ kind: 'none', reason: { code: 'unknown_term' } });
  });
});
