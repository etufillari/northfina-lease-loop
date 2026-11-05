import { beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import type { Asset, CoefficientTable, PriceList, VatRates } from '@/data/schemas';
import { quoteFor, type QuoteInput } from './quote';

let asset: Asset;
let priceLists: PriceList[];
let coefficientTable: CoefficientTable;
let vatRates: VatRates;

beforeAll(async () => {
  const [assets, lists, table, rates] = await Promise.all([
    loadAssets(),
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);
  const selected = assets.find((candidate) => candidate.id === 'ebike-003');
  if (!selected) throw new Error('test asset not found');
  asset = selected;
  priceLists = lists;
  coefficientTable = table;
  vatRates = rates;
});

const input: QuoteInput = {
  assetId: 'ebike-003',
  date: '2026-11-05',
  downPaymentCents: 0,
  termMonths: 36,
};

describe('quoteFor', () => {
  it('returns the pricing breakdown, VAT preview and source versions', () => {
    expect(quoteFor(asset, priceLists, coefficientTable, vatRates, input)).toEqual({
      ok: true,
      quote: {
        asset: { id: 'ebike-003', status: 'available' },
        pricing: {
          netListPriceCents: 389_000,
          downPaymentCents: 0,
          financedCents: 389_000,
          termMonths: 36,
          coefficientBand: 'B',
          monthlyFactor: 0.027584,
          monthlyNetRentCents: 10_730,
          buyoutPercent: 15,
          endOfTermBuyoutCents: 58_350,
          totalCostWithBuyoutCents: 444_630,
        },
        vatPreview: {
          invoiceDate: '2026-11-05',
          ratePercent: 25.5,
          monthlyNetRentCents: 10_730,
          monthlyVatCents: 2_736,
          monthlyGrossRentCents: 13_466,
        },
        sources: {
          priceListVersion: 1,
          coefficientTableId: 'ct-2026-1',
          coefficientTableVersion: 1,
        },
      },
    });
  });

  it('uses the price list version selected by the quote date', () => {
    const result = quoteFor(asset, priceLists, coefficientTable, vatRates, {
      ...input,
      date: '2026-11-06',
    });

    expect(result).toMatchObject({
      ok: true,
      quote: {
        pricing: { netListPriceCents: 408_400 },
        sources: { priceListVersion: 2 },
      },
    });
  });

  it('rejects an asset that is not available', () => {
    expect(
      quoteFor({ ...asset, status: 'reserved' }, priceLists, coefficientTable, vatRates, input)
    ).toEqual({ ok: false, reason: 'asset_unavailable', status: 'reserved' });
  });

  it('passes pricing failures through without producing a partial quote', () => {
    expect(
      quoteFor(asset, priceLists, coefficientTable, vatRates, { ...input, termMonths: 3 })
    ).toEqual({ ok: false, reason: 'unknown_term' });
  });
});
