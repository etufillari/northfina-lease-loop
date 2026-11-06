// The price lock (scenario card 2). A quote is an estimate; **signing** locks the price, from the
// price list valid on the signing day. If that price differs from the quote the customer applied
// with, they see both and must accept the new one: a price never changes silently, in either
// direction. Pure: dates and prices are arguments.
import type { ApplicationQuoteItem, ApplicationSelection } from './application-cart';
import { isCalendarDate } from './application-fields';

/** An approved application (and its quote) can be signed for this many days. */
export const QUOTE_VALID_DAYS = 7;

const dayNumber = (isoDate: string) =>
  Date.UTC(+isoDate.slice(0, 4), +isoDate.slice(5, 7) - 1, +isoDate.slice(8, 10)) / 86_400_000;

/** True from the quote day until QUOTE_VALID_DAYS days later, both included. */
export function quoteStillValid(quoteDate: string, today: string): boolean {
  if (!isCalendarDate(quoteDate) || !isCalendarDate(today)) return false;
  const age = dayNumber(today) - dayNumber(quoteDate);
  return age >= 0 && age <= QUOTE_VALID_DAYS;
}

/** The same items, terms and down payments, whatever their prices are today. */
export function sameSelection(
  left: readonly ApplicationSelection[],
  right: readonly ApplicationSelection[]
): boolean {
  const key = (items: readonly ApplicationSelection[]) =>
    JSON.stringify(
      [...items]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((item) => [item.id, item.termMonths, item.downPaymentCents])
    );
  return key(left) === key(right);
}

export type PriceChange = {
  id: string;
  name: string;
  quotedPriceCents: number;
  quotedPriceListVersion: number;
  quotedMonthlyTotalCents: number;
  priceCents: number;
  priceListVersion: number;
  monthlyTotalCents: number;
  /** Today's price minus the quoted price: negative when it got cheaper. */
  differenceCents: number;
};

/** Items whose price or monthly payment today differs from the quote. */
export function priceChanges(
  quoted: readonly ApplicationQuoteItem[],
  current: readonly ApplicationQuoteItem[]
): PriceChange[] {
  return current.flatMap((item) => {
    const before = quoted.find((candidate) => candidate.id === item.id);
    if (
      !before ||
      (before.priceCents === item.priceCents &&
        before.priceListVersion === item.priceListVersion &&
        before.monthlyTotalCents === item.monthlyTotalCents)
    )
      return [];
    return [
      {
        id: item.id,
        name: item.name,
        quotedPriceCents: before.priceCents,
        quotedPriceListVersion: before.priceListVersion,
        quotedMonthlyTotalCents: before.monthlyTotalCents,
        priceCents: item.priceCents,
        priceListVersion: item.priceListVersion,
        monthlyTotalCents: item.monthlyTotalCents,
        differenceCents: item.priceCents - before.priceCents,
      },
    ];
  });
}
