import { beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadPriceLists, loadResidualCurves } from '@/data/load';
import type { Asset, PriceList, ResidualCurves } from '@/data/schemas';
import { isUsedItem, lifecycleMetadataFor, usedItemValueOn } from './used-item-value';

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

describe('isUsedItem', () => {
  it('tells new items from items with earlier leases', () => {
    expect(isUsedItem(asset('ebike-001'))).toBe(false);
    expect(isUsedItem(asset('ebike-007'))).toBe(true);
    expect(isUsedItem({ ...asset('ebike-001'), first_leased_on: '2026-02-01' })).toBe(true);
  });
});

describe('lifecycleMetadataFor', () => {
  it('assumes the price list v1 price and 1 January of the model year', () => {
    expect(lifecycleMetadataFor(asset('ebike-007'), priceLists)).toEqual({
      firstLeasedOn: '2023-01-01',
      originalListPriceCents: 549_000,
      source: 'demo_fallback',
      originalPriceListVersion: 1,
    });
  });

  it('prefers stored values', () => {
    expect(
      lifecycleMetadataFor(
        {
          ...asset('ebike-007'),
          first_leased_on: '2023-06-15',
          original_list_price_cents: 500_000,
        },
        priceLists
      )
    ).toEqual({
      firstLeasedOn: '2023-06-15',
      originalListPriceCents: 500_000,
      source: 'stored',
      originalPriceListVersion: null,
    });
  });

  it('finds nothing for an item missing from every price list', () => {
    expect(lifecycleMetadataFor({ ...asset('ebike-007'), id: 'missing' }, priceLists)).toBeNull();
  });
});

describe('usedItemValueOn', () => {
  it('reproduces the ebike-007 worked example', () => {
    expect(usedItemValueOn(asset('ebike-007'), priceLists, curves, '2026-11-06')).toEqual({
      ok: true,
      valuation: {
        marketValueCents: 92_781,
        firstLeasedOn: '2023-01-01',
        originalListPriceCents: 549_000,
        originalPriceListVersion: 1,
        ageMonths: 46,
        curvePercent: 32.5,
        conditionMultiplier: 0.65,
        usageAdjustmentPercent: -20,
      },
    });
  });

  it('refuses a first lease after the valuation date', () => {
    expect(usedItemValueOn(asset('ebike-007'), priceLists, curves, '2022-12-31')).toEqual({
      ok: false,
      reason: 'invalid_lifecycle_dates',
    });
  });

  it('reports an item with no original price', () => {
    expect(
      usedItemValueOn({ ...asset('ebike-007'), id: 'missing' }, priceLists, curves, '2026-11-06')
    ).toEqual({ ok: false, reason: 'original_price_not_found' });
  });

  it('reports a category without a curve', () => {
    const { e_bike: _removed, ...otherCurves } = curves.curves;
    expect(
      usedItemValueOn(
        asset('ebike-007'),
        priceLists,
        { ...curves, curves: otherCurves as ResidualCurves['curves'] },
        '2026-11-06'
      )
    ).toEqual({ ok: false, reason: 'residual_value_unavailable' });
  });
});
