import type { Asset, PriceList } from '@/data/schemas';
import type { ValuationBaseline } from '@/data/valuation-baseline-schemas';
import { addMonthsAnchored, isIsoDate } from './calendar';

/** Completed anchored calendar months: Jan 31 to Feb 28 counts as one month. */
export function wholeMonthsSince(firstUsedOn: string, onDate: string): number {
  if (!isIsoDate(firstUsedOn) || !isIsoDate(onDate) || firstUsedOn > onDate) {
    throw new RangeError('valuation dates must be real ISO dates in chronological order');
  }
  const months =
    (Number(onDate.slice(0, 4)) - Number(firstUsedOn.slice(0, 4))) * 12 +
    Number(onDate.slice(5, 7)) -
    Number(firstUsedOn.slice(5, 7));
  return months - (addMonthsAnchored(firstUsedOn, months) > onDate ? 1 : 0);
}

/** Recorded first-life facts take precedence; imported history uses labelled approved assumptions. */
export function resolveValuationBaseline(input: {
  asset: Pick<Asset, 'id' | 'model_year'>;
  saved: ValuationBaseline | null;
  priceLists: readonly PriceList[];
  firstLease?: { startDate: string; originalPriceCents: number };
}): ValuationBaseline | null {
  if (input.saved) return input.saved;
  if (input.firstLease)
    return {
      firstUsedOn: input.firstLease.startDate,
      originalPriceCents: input.firstLease.originalPriceCents,
      source: 'recorded_lease',
      reason: null,
    };
  const price = input.priceLists.find((list) => list.version === 1)?.prices[input.asset.id];
  if (!price || !Number.isSafeInteger(price) || price < 0) return null;
  const firstUsedOn = `${String(input.asset.model_year).padStart(4, '0')}-01-01`;
  if (!isIsoDate(firstUsedOn)) return null;
  return { firstUsedOn, originalPriceCents: price, source: 'imported_assumption', reason: null };
}
