import { beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadPriceLists, loadResidualCurves } from '@/data/load';
import type { Asset, PriceList, ResidualCurves } from '@/data/schemas';
import { itemPriceOn } from './item-price';

let assets: Asset[];
let priceLists: PriceList[];
let curves: ResidualCurves;

function asset(id: string): Asset {
  const found = assets.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`test asset ${id} not found`);
  return found;
}

beforeAll(async () => {
  [assets, priceLists, curves] = await Promise.all([
    loadAssets(),
    loadPriceLists(),
    loadResidualCurves(),
  ]);
});

describe('itemPriceOn', () => {
  it('uses the list price in force for a new item', () => {
    expect(itemPriceOn(asset('ebike-003'), priceLists, curves, '2026-11-06')).toEqual({
      ok: true,
      priceCents: 408_400,
      priceListVersion: 2,
      basis: 'list_price',
      valuation: null,
    });
  });

  it('uses the market value for a used item', () => {
    expect(itemPriceOn(asset('ebike-007'), priceLists, curves, '2026-11-06')).toMatchObject({
      ok: true,
      priceCents: 92_781,
      priceListVersion: 2,
      basis: 'market_value',
      valuation: { originalListPriceCents: 549_000, ageMonths: 46 },
    });
  });

  it('fails when no price list applies on the date', () => {
    expect(itemPriceOn(asset('ebike-007'), priceLists, curves, '2025-12-31')).toEqual({
      ok: false,
      reason: 'no_price_list_on_date',
    });
  });

  it('passes on a valuation failure', () => {
    expect(
      itemPriceOn({ ...asset('ebike-007'), model_year: 2030 }, priceLists, curves, '2026-11-06')
    ).toEqual({ ok: false, reason: 'invalid_lifecycle_dates' });
  });
});
