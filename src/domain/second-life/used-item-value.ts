// What a used item is worth today, for items whose earlier leases are not in the data pack.
import type { Asset, PriceList, ResidualCurves } from '@/data/schemas';
import { wholeMonthsBetween } from '../calendar';
import { residualValueFor } from './residual-value';

export type LifecycleMetadataSource = 'stored' | 'demo_fallback';

export type LifecyclePricingMetadata = {
  firstLeasedOn: string;
  originalListPriceCents: number;
  source: LifecycleMetadataSource;
  originalPriceListVersion: number | null;
};

export type UsedItemValuation = {
  marketValueCents: number;
  firstLeasedOn: string;
  originalListPriceCents: number;
  originalPriceListVersion: number | null;
  ageMonths: number;
  curvePercent: number;
  conditionMultiplier: number;
  usageAdjustmentPercent: number;
};

export type UsedItemValueResult =
  | { ok: true; valuation: UsedItemValuation }
  | {
      ok: false;
      reason: 'original_price_not_found' | 'invalid_lifecycle_dates' | 'residual_value_unavailable';
    };

/**
 * An item is used once it has been through a lease: the data pack counts those in
 * `previous_lives`, and a lease signed in this app stores `first_leased_on`.
 */
export function isUsedItem(asset: Asset): boolean {
  return asset.previous_lives > 0 || asset.first_leased_on !== undefined;
}

function firstPriceListFor(priceLists: readonly PriceList[], assetId: string) {
  const sorted = [...priceLists].sort((left, right) =>
    left.valid_from.localeCompare(right.valid_from)
  );
  const first = sorted[0];
  const priceCents = first?.prices[assetId];
  if (!first || priceCents === undefined) return null;
  return { priceCents, version: first.version };
}

/**
 * Finds the first-lease date and price of an item. Stored values win. The data pack has no
 * lease history, so the fallback assumptions are: the price at first lease is the item's
 * price in the earliest price list, and the first lease was on 1 January of its model year.
 */
export function lifecycleMetadataFor(
  asset: Asset,
  priceLists: readonly PriceList[]
): LifecyclePricingMetadata | null {
  const originalPrice =
    asset.original_list_price_cents === undefined
      ? firstPriceListFor(priceLists, asset.id)
      : { priceCents: asset.original_list_price_cents, version: null };
  if (!originalPrice) return null;

  return {
    firstLeasedOn: asset.first_leased_on ?? `${asset.model_year}-01-01`,
    originalListPriceCents: originalPrice.priceCents,
    source:
      asset.first_leased_on !== undefined && asset.original_list_price_cents !== undefined
        ? 'stored'
        : 'demo_fallback',
    originalPriceListVersion: originalPrice.version,
  };
}

/**
 * Values a used item on `asOf`: price at first lease × curve(age in whole months) ×
 * condition × usage. `residualValueFor` rounds the result once to the nearest cent.
 */
export function usedItemValueOn(
  asset: Asset,
  priceLists: readonly PriceList[],
  curves: ResidualCurves,
  asOf: string
): UsedItemValueResult {
  const metadata = lifecycleMetadataFor(asset, priceLists);
  if (!metadata) return { ok: false, reason: 'original_price_not_found' };
  if (metadata.firstLeasedOn > asOf) return { ok: false, reason: 'invalid_lifecycle_dates' };

  const ageMonths = wholeMonthsBetween(metadata.firstLeasedOn, asOf);
  const residual = residualValueFor({
    originalListPriceCents: metadata.originalListPriceCents,
    category: asset.category,
    condition: asset.condition,
    usageValue: asset.usage.value,
    ageMonths,
    curves,
  });
  if (!residual.ok) return { ok: false, reason: 'residual_value_unavailable' };

  return {
    ok: true,
    valuation: {
      marketValueCents: residual.marketValueCents,
      firstLeasedOn: metadata.firstLeasedOn,
      originalListPriceCents: metadata.originalListPriceCents,
      originalPriceListVersion: metadata.originalPriceListVersion,
      ageMonths,
      curvePercent: residual.curvePercent,
      conditionMultiplier: residual.conditionMultiplier,
      usageAdjustmentPercent: residual.usageAdjustmentPercent,
    },
  };
}
