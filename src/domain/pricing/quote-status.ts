// Where a stored quote stands on a day (D7): still valid or expired, and whether a cheaper
// price list has gone live since. The quote's own price never changes; this only tells the
// customer that a new quote would be cheaper, so the page can offer one.
import type { PriceList } from '@/data/schemas';
import { listPriceOn } from '../price-list';

export type QuoteForStatus = {
  assetId: string;
  quoteDate: string;
  /** The last day the quote can be used, inclusive. */
  validUntil: string;
  priceListVersion: number;
  unitListPriceCents: number;
};

export type QuoteStatus = {
  status: 'valid' | 'expired';
  validUntil: string;
  lockedListVersion: number;
  lockedUnitPriceCents: number;
  /** The list in force on `today` for this asset, or null when none prices it. */
  todayList: { version: number; unitPriceCents: number } | null;
  /** True when today's list is a different version and prices the unit lower. */
  cheaperListLive: boolean;
};

export function quoteStatusOn(
  quote: QuoteForStatus,
  today: string,
  priceLists: readonly PriceList[]
): QuoteStatus {
  const price = listPriceOn(priceLists, quote.assetId, today);
  const todayList = price.ok
    ? { version: price.priceListVersion, unitPriceCents: price.priceCents }
    : null;
  return {
    // ISO days compare as strings.
    status: today <= quote.validUntil ? 'valid' : 'expired',
    validUntil: quote.validUntil,
    lockedListVersion: quote.priceListVersion,
    lockedUnitPriceCents: quote.unitListPriceCents,
    todayList,
    cheaperListLive:
      todayList !== null &&
      todayList.version !== quote.priceListVersion &&
      todayList.unitPriceCents < quote.unitListPriceCents,
  };
}
