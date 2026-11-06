// Worked example 2: which net list price applies to an asset on a given day.
import type { PriceList } from '@/data/schemas';

export type ListPriceResult =
  | { ok: true; priceCents: number; priceListVersion: number; isRelisted?: boolean }
  | { ok: false; reason: 'unknown_asset' | 'no_price_list_on_date' };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns the net list price (cents, VAT excluded) of `assetId` on `isoDate` (`YYYY-MM-DD`).
 * A price list applies from `valid_from` to `valid_to`, both days included;
 * `valid_to: null` means it has no end yet.
 *
 * The date is an argument on purpose: the caller decides what "today" is, so tests can
 * ask about any day and the answer never changes at midnight.
 */
export function listPriceOn(
  priceLists: readonly PriceList[],
  assetId: string,
  isoDate: string
): ListPriceResult {
  if (!ISO_DATE.test(isoDate)) {
    throw new RangeError(`isoDate must look like YYYY-MM-DD, got "${isoDate}"`);
  }

  // ISO dates sort the same way as the days they name, so plain string comparison works.
  const priceList = priceLists.find(
    (list) => list.valid_from <= isoDate && (list.valid_to === null || isoDate <= list.valid_to)
  );
  if (!priceList) return { ok: false, reason: 'no_price_list_on_date' };

  const priceCents = priceList.prices[assetId];
  if (priceCents === undefined) return { ok: false, reason: 'unknown_asset' };

  return { ok: true, priceCents, priceListVersion: priceList.version };
}

/**
 * Resolves the effective net list price for an asset on `isoDate`:
 * - If the asset has a stored `relist_price_cents` (a relisted second/third-life item),
 *   uses `relist_price_cents` instead of the price list, while preserving the active
 *   `priceListVersion` on `isoDate`.
 * - Otherwise delegates to `listPriceOn(priceLists, asset.id, isoDate)`.
 */
export function effectiveAssetPriceOn(
  priceLists: readonly PriceList[],
  asset: { id: string; relist_price_cents?: number | null },
  isoDate: string
): ListPriceResult {
  if (!ISO_DATE.test(isoDate)) {
    throw new RangeError(`isoDate must look like YYYY-MM-DD, got "${isoDate}"`);
  }
  const base = listPriceOn(priceLists, asset.id, isoDate);
  if (asset.relist_price_cents != null) {
    if (!Number.isInteger(asset.relist_price_cents) || asset.relist_price_cents < 0) {
      throw new RangeError(
        `relist_price_cents must be a non-negative integer, got ${asset.relist_price_cents}`
      );
    }
    return {
      ok: true,
      priceCents: asset.relist_price_cents,
      priceListVersion: base.ok ? base.priceListVersion : 1,
      isRelisted: true,
    };
  }
  return base;
}

/**
 * The list price a signed contract is priced from: the price locked in a longer-term offer
 * when it was signed under one, otherwise the catalogue price on the signing day.
 */
export function contractListPrice(input: {
  offer: { priceCents: number; priceListVersion: number } | null;
  catalogue: ListPriceResult;
}): ListPriceResult {
  return input.offer ? { ok: true, ...input.offer } : input.catalogue;
}
