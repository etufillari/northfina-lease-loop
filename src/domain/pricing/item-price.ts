// The price a lease is calculated from: list price for a new item, market value for a used one.
import type { Asset, PriceList, ResidualCurves } from '@/data/schemas';
import {
  isUsedItem,
  usedItemValueOn,
  type UsedItemValuation,
  type UsedItemValueResult,
} from '../second-life/used-item-value';
import { listPriceOn, type ListPriceResult } from './price-list';

export type PriceBasis = 'list_price' | 'market_value';

export type ItemPriceResult =
  | {
      ok: true;
      priceCents: number;
      /** The price list in force on the date, also for a used item valued from an older one. */
      priceListVersion: number;
      basis: PriceBasis;
      valuation: UsedItemValuation | null;
    }
  | Extract<ListPriceResult, { ok: false }>
  | Extract<UsedItemValueResult, { ok: false }>;

/** Returns what `asset` costs on `isoDate`, in net cents, and how that price was reached. */
export function itemPriceOn(
  asset: Asset,
  priceLists: readonly PriceList[],
  curves: ResidualCurves,
  isoDate: string
): ItemPriceResult {
  const listPrice = listPriceOn(priceLists, asset.id, isoDate);
  if (!listPrice.ok) return listPrice;

  if (!isUsedItem(asset)) {
    return { ...listPrice, basis: 'list_price', valuation: null };
  }

  const used = usedItemValueOn(asset, priceLists, curves, isoDate);
  if (!used.ok) return used;
  return {
    ok: true,
    priceCents: used.valuation.marketValueCents,
    priceListVersion: listPrice.priceListVersion,
    basis: 'market_value',
    valuation: used.valuation,
  };
}
