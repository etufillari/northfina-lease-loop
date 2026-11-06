// Worked example 2: which net list price applies to an asset on a given day.
import type { Asset, PriceList } from '@/data/schemas';
import { isIsoDate } from '../dates';

export type ListPriceResult =
  | { ok: true; priceCents: number; priceListVersion: number }
  | { ok: false; reason: 'unknown_asset' | 'no_price_list_on_date' };

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
  if (!isIsoDate(isoDate)) {
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

export type AssetPriceResult =
  | { ok: true; priceCents: number; priceListVersion: number | null }
  | { ok: false; reason: 'unknown_asset' | 'no_price_list_on_date' };

/** What an asset leases at: its own re-list price if it has one, otherwise the list price. */
export function assetPriceOn(
  priceLists: readonly PriceList[],
  asset: Pick<Asset, 'id' | 'relist_price_cents'>,
  isoDate: string
): AssetPriceResult {
  if (asset.relist_price_cents !== undefined) {
    return { ok: true, priceCents: asset.relist_price_cents, priceListVersion: null };
  }
  return listPriceOn(priceLists, asset.id, isoDate);
}
