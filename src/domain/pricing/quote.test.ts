import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadAssets,
  loadCoefficientTable,
  loadPriceLists,
  loadResidualCurves,
  loadVatRates,
} from '@/data/load';
import type { Asset, CoefficientTable, PriceList, ResidualCurves, VatRates } from '@/data/schemas';
import { quoteFor, type QuoteInput } from './quote';

let asset: Asset;
let priceLists: PriceList[];
let residualCurves: ResidualCurves;
let coefficientTable: CoefficientTable;
let vatRates: VatRates;

beforeAll(async () => {
  const [assets, lists, curves, table, rates] = await Promise.all([
    loadAssets(),
    loadPriceLists(),
    loadResidualCurves(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);
  const selected = assets.find((candidate) => candidate.id === 'ebike-003');
  if (!selected) throw new Error('test asset not found');
  asset = selected;
  priceLists = lists;
  residualCurves = curves;
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
    expect(quoteFor(asset, priceLists, residualCurves, coefficientTable, vatRates, input)).toEqual({
      ok: true,
      quote: {
        asset: { id: 'ebike-003', status: 'available' },
        pricing: {
          netListPriceCents: 389_000,
          downPaymentCents: 0,
          financedCents: 389_000,
          termMonths: 36,
          coefficientBand: 'B',
          annualInterestBasisPoints: 790,
          monthlyFactor: 0.027584,
          monthlyNetRentCents: 10_730,
          buyoutPercent: 15,
          endOfTermBuyoutCents: 58_350,
          totalCostWithBuyoutCents: 444_630,
        },
        valuation: null,
        vatPreview: {
          invoiceDate: '2026-11-05',
          ratePercent: 25.5,
          monthlyNetRentCents: 10_730,
          monthlyVatCents: 2_736,
          monthlyGrossRentCents: 13_466,
        },
        sources: {
          priceBasis: 'list_price',
          priceListVersion: 1,
          coefficientTableId: 'ct-2026-1',
          coefficientTableVersion: 1,
        },
      },
    });
  });

  it('uses the price list version selected by the quote date', () => {
    const result = quoteFor(asset, priceLists, residualCurves, coefficientTable, vatRates, {
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

  it('prices a used item from its market value, not the current list price', () => {
    const used: Asset = {
      ...asset,
      id: 'ebike-005',
      model_year: 2025,
      condition: 'like_new',
      usage: { unit: 'km', value: 1_200 },
      previous_lives: 1,
    };

    const result = quoteFor(used, priceLists, residualCurves, coefficientTable, vatRates, {
      ...input,
      assetId: 'ebike-005',
      date: '2026-11-06',
    });

    expect(result).toMatchObject({
      ok: true,
      quote: {
        pricing: { netListPriceCents: 81_416, financedCents: 81_416, coefficientBand: 'A' },
        valuation: { originalListPriceCents: 159_000, ageMonths: 22 },
        sources: { priceBasis: 'market_value', priceListVersion: 2 },
      },
    });
  });

  it('rejects an asset that is not available', () => {
    expect(
      quoteFor(
        { ...asset, status: 'reserved' },
        priceLists,
        residualCurves,
        coefficientTable,
        vatRates,
        input
      )
    ).toEqual({ ok: false, reason: 'asset_unavailable', status: 'reserved' });
  });

  it('passes pricing failures through without producing a partial quote', () => {
    expect(
      quoteFor(asset, priceLists, residualCurves, coefficientTable, vatRates, {
        ...input,
        termMonths: 3,
      })
    ).toEqual({ ok: false, reason: 'unknown_term' });
  });
});
