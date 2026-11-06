// What a customer may pick for an item: the terms on offer and the down payments that keep the
// financed amount inside the coefficient table. Used by the price sliders.
import type { AssetStatus, CoefficientTable } from '@/data/schemas';
import type { ListPriceResult } from './price-list';
import { calculateQuote, type QuoteBreakdown } from './pricing';

const EURO = 100;

/** The slider moves in bigger steps as the range grows. Rows are `up to this width → step`. */
const STEP_BY_RANGE_WIDTH = [
  { upToCents: 100 * EURO, stepCents: 1 * EURO },
  { upToCents: 5_000 * EURO, stepCents: 10 * EURO },
  { upToCents: 50_000 * EURO, stepCents: 100 * EURO },
] as const;
const WIDEST_STEP_CENTS = 500 * EURO;

/** Terms in the coefficient table, shortest first. */
export function offeredTerms(table: CoefficientTable): number[] {
  return Object.keys(table.end_of_term_buyout_percent_of_financed)
    .map(Number)
    .sort((a, b) => a - b);
}

export type DownPaymentRange = {
  /** Above 0 only when the price is over the financing maximum. */
  minCents: number;
  maxCents: number;
  /** Slider step. The exact minimum and maximum may fall between steps. */
  stepCents: number;
};

export type DownPaymentRangeResult =
  { ok: true; range: DownPaymentRange } | { ok: false; reason: 'below_minimum' };

/**
 * The down payments allowed on a net price, in whole euros so that a customer never has to
 * type cents. The minimum rounds up and the maximum rounds down, so both stay financeable.
 *
 * A price under the lowest band cannot be leased at all: a down payment only makes it smaller.
 * A price over the highest band can, with enough down: 260 000 € needs at least 10 000 €.
 */
export function downPaymentRange(
  table: CoefficientTable,
  listPriceCents: number
): DownPaymentRangeResult {
  const lowest = Math.min(...table.bands.map((band) => band.min_financed_cents));
  const highest = Math.max(...table.bands.map((band) => band.max_financed_cents));
  if (listPriceCents < lowest) return { ok: false, reason: 'below_minimum' };

  const minCents = Math.ceil(Math.max(0, listPriceCents - highest) / EURO) * EURO;
  const maxCents = Math.floor((listPriceCents - lowest) / EURO) * EURO;
  const width = maxCents - minCents;
  const stepCents =
    STEP_BY_RANGE_WIDTH.find((row) => width <= row.upToCents)?.stepCents ?? WIDEST_STEP_CENTS;
  return { ok: true, range: { minCents, maxCents, stepCents } };
}

export type LeaseOffer =
  | { ok: true; listPriceCents: number; priceListVersion: number; range: DownPaymentRange }
  | { ok: false; reason: 'reserved' | 'returned' | 'no_price' | 'below_minimum' };

/**
 * Whether the customer can pick a lease for this item, and if not, why. The item's status comes
 * first: a reserved item is not on offer whatever it costs. A returned item gets its price
 * from the second-life assessment, so its list price says nothing about its next lease.
 */
export function leaseOffer(
  table: CoefficientTable,
  status: AssetStatus,
  price: ListPriceResult
): LeaseOffer {
  if (status !== 'available') return { ok: false, reason: status };
  if (!price.ok) return { ok: false, reason: 'no_price' };

  const range = downPaymentRange(table, price.priceCents);
  if (!range.ok) return range;
  return {
    ok: true,
    listPriceCents: price.priceCents,
    priceListVersion: price.priceListVersion,
    range: range.range,
  };
}

/** Whole euros inside the range, for a typed amount or one read from a URL. */
export function clampDownPayment(range: DownPaymentRange, cents: number): number {
  const wholeEuros = Math.floor(cents / EURO) * EURO;
  return Math.min(range.maxCents, Math.max(range.minCents, wholeEuros));
}

/**
 * Slider positions after 0. The slider moves in positions rather than cents, so its last
 * position is always the exact maximum, even when that falls between two steps.
 */
export function sliderPositions(range: DownPaymentRange): number {
  return Math.ceil((range.maxCents - range.minCents) / range.stepCents);
}

export function positionToDownPayment(range: DownPaymentRange, position: number): number {
  return Math.min(range.maxCents, range.minCents + position * range.stepCents);
}

/** The nearest position. It only places the slider, so the rounding never touches money. */
export function downPaymentToPosition(range: DownPaymentRange, cents: number): number {
  if (cents >= range.maxCents) return sliderPositions(range);
  return Math.round((cents - range.minCents) / range.stepCents);
}

export type LowerRentOption = { downPaymentCents: number; monthlyNetRentCents: number };

/**
 * A smaller down payment that gives a lower rent, or null if there is none.
 *
 * Paying more down normally lowers the rent, but just below a band's upper limit it raises
 * it, because the lower band has a higher factor. On 200 000 cents over 36 months, 0 € down
 * costs 5 517 a month and 1 € down costs 5 722. The only candidate is the smallest financed
 * amount in the next band up: anything further up that band costs more each month.
 *
 * A lower rent here also means a lower contract total: less down and less every month.
 */
export function lowerRentOption(
  table: CoefficientTable,
  quote: QuoteBreakdown
): LowerRentOption | null {
  const band = table.bands.find((candidate) => candidate.band === quote.band);
  if (!band) return null;
  const nextBand = table.bands.find(
    (candidate) => candidate.min_financed_cents === band.max_financed_cents + 1
  );
  if (!nextBand) return null;

  const raw = quote.listPriceCents - nextBand.min_financed_cents;
  if (raw < 0) return null; // the price never reaches the next band
  const downPaymentCents = Math.floor(raw / EURO) * EURO;

  const option = calculateQuote(table, {
    listPriceCents: quote.listPriceCents,
    downPaymentCents,
    termMonths: quote.termMonths,
  });
  if (!option.ok || option.quote.monthlyNetRentCents >= quote.monthlyNetRentCents) return null;
  return { downPaymentCents, monthlyNetRentCents: option.quote.monthlyNetRentCents };
}
