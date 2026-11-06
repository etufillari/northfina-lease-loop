import type { AssetCategory, CoefficientTable, VatRate } from '@/data/schemas';
import type { ApplicationContext } from './application';
import { checkoutQuote } from './checkout-quote';

export type ApplicationSelection = { id: string; termMonths: number; downPaymentCents: number };
export type ApplicationCatalogue = {
  options: {
    id: string;
    name: string;
    category: AssetCategory;
    available: boolean;
    priceCents: number;
    priceListVersion: number;
  }[];
  table: CoefficientTable;
  rates: VatRate[];
  today: string;
};
export type ApplicationQuoteItem = ApplicationSelection &
  ApplicationCatalogue['options'][number] & {
    monthlyNetCents: number;
    monthlyTotalCents: number;
    buyoutCents: number;
    totalCents: number;
  };

/** Apply question thresholds and affordability to the entire cart, not isolated items. */
export function applicationCart(
  data: ApplicationCatalogue,
  selections: readonly ApplicationSelection[]
): { items: ApplicationQuoteItem[]; context: ApplicationContext } | null {
  if (
    !selections.length ||
    selections.length > 10 ||
    new Set(selections.map((item) => item.id)).size !== selections.length
  )
    return null;
  const items: ApplicationQuoteItem[] = [];
  for (const selection of selections) {
    const option = data.options.find((item) => item.id === selection.id);
    if (
      !option?.available ||
      !Number.isInteger(selection.termMonths) ||
      selection.termMonths < 1 ||
      selection.termMonths > 60
    )
      return null;
    const quote = checkoutQuote(
      option.priceCents,
      selection.downPaymentCents,
      selection.termMonths,
      data.today,
      data.table,
      data.rates
    );
    if (!quote) return null;
    items.push({ ...option, ...selection, ...quote });
  }
  const financedCents = items.reduce(
    (sum, item) => sum + item.priceCents - item.downPaymentCents,
    0
  );
  const monthlyTotalCents = items.reduce((sum, item) => sum + item.monthlyTotalCents, 0);
  if (!Number.isSafeInteger(financedCents) || !Number.isSafeInteger(monthlyTotalCents)) return null;
  return {
    items,
    context: {
      categories: [...new Set(items.map((item) => item.category))],
      financedCents,
      monthlyTotalCents,
      termMonths: Math.max(...items.map((item) => item.termMonths)),
      startDate: data.today,
      minimumCents: Math.min(...data.table.bands.map((band) => band.min_financed_cents)),
      maximumCents: Math.max(...data.table.bands.map((band) => band.max_financed_cents)),
    },
  };
}

/** Canonical quote identity, insensitive to item order. Dates are checked by the caller. */
export function sameApplicationItems(
  left: readonly ApplicationQuoteItem[],
  right: readonly ApplicationQuoteItem[]
): boolean {
  const key = (items: readonly ApplicationQuoteItem[]) =>
    JSON.stringify(
      [...items]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((item) => [
          item.id,
          item.termMonths,
          item.downPaymentCents,
          item.priceCents,
          item.priceListVersion,
          item.monthlyNetCents,
          item.monthlyTotalCents,
        ])
    );
  return key(left) === key(right);
}
