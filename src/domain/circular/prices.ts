import type { PriceList } from '@/data/schemas';
import { addCalendarDays } from '@/domain/lease-engine/calendar';
export type PublishedOffer = {
  id: string;
  assetId: string;
  netListCents: number;
  publishedOn: string;
};
/** Split inclusive price ranges at publication dates, retaining original historical prices. */
export function withCircularPrices(
  lists: readonly PriceList[],
  offers: readonly PublishedOffer[]
): PriceList[] {
  const cuts = new Set(lists.map((list) => list.valid_from));
  for (const list of lists)
    if (list.valid_to) {
      const next = addCalendarDays(list.valid_to, 1);
      if (next.ok) cuts.add(next.value);
    }
  for (const offer of offers) cuts.add(offer.publishedOn);
  const dates = [...cuts].sort();
  return dates.flatMap((day, index) => {
    const base = lists.find(
      (list) => list.valid_from <= day && (list.valid_to === null || day <= list.valid_to)
    );
    if (!base) return [];
    const prices = { ...base.prices };
    for (const offer of [...offers].sort(
      (a, b) => a.publishedOn.localeCompare(b.publishedOn) || a.id.localeCompare(b.id)
    )) {
      if (offer.publishedOn <= day) prices[offer.assetId] = offer.netListCents;
    }
    const next = dates[index + 1];
    let validTo = base.valid_to;
    if (next) {
      // Find the predecessor date without a clock; at most one calendar day backward.
      const [year, month, dayOfMonth] = next.split('-').map(Number);
      if (year === undefined || month === undefined || dayOfMonth === undefined)
        throw new RangeError('Invalid date boundary');
      let previous = '';
      if (dayOfMonth > 1)
        previous = `${next.slice(0, 8)}${String(dayOfMonth - 1).padStart(2, '0')}`;
      else {
        const start = `${String(month === 1 ? year - 1 : year).padStart(4, '0')}-${String(month === 1 ? 12 : month - 1).padStart(2, '0')}`;
        for (const d of [31, 30, 29, 28]) {
          const candidate = `${start}-${d}`;
          const after = addCalendarDays(candidate, 1);
          if (after.ok && after.value === next) {
            previous = candidate;
            break;
          }
        }
      }
      if (previous && (validTo === null || previous < validTo)) validTo = previous;
    }
    return [{ ...base, valid_from: day, valid_to: validTo, prices }];
  });
}
