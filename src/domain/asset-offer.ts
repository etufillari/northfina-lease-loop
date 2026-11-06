import type { PriceList } from '@/data/schemas';
import { listPriceOn } from './price-list';

/** A published second-life offer takes precedence; existing contracts retain their snapshots. */
export function assetOfferPrice(
  asset: { id: string; secondLifePriceCents: number | null; priceRevision: number },
  lists: readonly PriceList[],
  today: string
) {
  if (asset.secondLifePriceCents !== null) {
    if (!Number.isSafeInteger(asset.secondLifePriceCents) || asset.secondLifePriceCents < 0)
      throw new RangeError('Invalid second-life price');
    return {
      ok: true as const,
      priceCents: asset.secondLifePriceCents,
      priceListVersion: asset.priceRevision,
    };
  }
  return listPriceOn(lists, asset.id, today);
}
