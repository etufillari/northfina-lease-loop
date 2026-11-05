// The lease quote: what the customer pays each month, net of VAT, from the coefficient table.
// VAT is added per invoice date (see vat.ts), because the rate can change during the lease.
import type { CoefficientTable } from '@/data/schemas';
import { monthlyFactorFor } from './coefficient';
import { roundHalfUp } from './money';
import { DOWN_PAYMENT_STEP_CENTS } from './pricing-rules';

export interface QuoteInput {
  /** Net list price on the quote date, from the price list. */
  listPriceCents: number;
  termMonths: number;
  /** Net, paid at signing. */
  downPaymentCents: number;
}

export type QuoteFailure =
  | 'below_minimum'
  | 'above_maximum'
  | 'unknown_term'
  | 'down_payment_negative'
  | 'down_payment_off_step'
  | 'down_payment_too_large';

export type LeaseQuote =
  | {
      ok: true;
      financedCents: number;
      band: string;
      factor: number;
      monthlyNetRentCents: number;
      /** Price to buy the item at the end of the term, net. */
      buyoutCents: number;
      /** Monthly rent × term, net. */
      totalNetRentCents: number;
      /** Down payment + all rents, net. The buyout is optional, so it is not included. */
      totalNetCostCents: number;
    }
  | { ok: false; reason: QuoteFailure };

export type DownPaymentBounds =
  | { ok: true; minCents: number; maxCents: number; stepCents: number }
  | { ok: false; reason: 'below_minimum' };

/**
 * Prices a lease: financed = list price − down payment; rent = financed × factor for the
 * band and term, rounded once, half up (D-005). Unusable inputs are results, not exceptions.
 */
export function quoteLease(table: CoefficientTable, input: QuoteInput): LeaseQuote {
  const { listPriceCents, termMonths, downPaymentCents } = input;
  for (const [name, value] of Object.entries(input)) {
    if (!Number.isInteger(value)) {
      throw new RangeError(`${name} must be a whole number, got ${value}`);
    }
  }

  if (downPaymentCents < 0) return { ok: false, reason: 'down_payment_negative' };
  if (downPaymentCents % DOWN_PAYMENT_STEP_CENTS !== 0) {
    return { ok: false, reason: 'down_payment_off_step' };
  }
  if (downPaymentCents >= listPriceCents) return { ok: false, reason: 'down_payment_too_large' };

  const financedCents = listPriceCents - downPaymentCents;
  const lookup = monthlyFactorFor(table, financedCents, termMonths);
  if (!lookup.ok) return lookup;
  const buyoutPercent = table.end_of_term_buyout_percent_of_financed[String(termMonths)];
  if (buyoutPercent === undefined) return { ok: false, reason: 'unknown_term' };

  const monthlyNetRentCents = roundHalfUp(financedCents * lookup.factor);
  const totalNetRentCents = monthlyNetRentCents * termMonths;
  return {
    ok: true,
    financedCents,
    band: lookup.band.band,
    factor: lookup.factor,
    monthlyNetRentCents,
    buyoutCents: roundHalfUp((financedCents * buyoutPercent) / 100),
    totalNetRentCents,
    totalNetCostCents: downPaymentCents + totalNetRentCents,
  };
}

/**
 * Down-payment slider limits for an item: every step inside them gives a valid quote.
 * The financed amount must stay inside the table, so an item above the top band needs a
 * down payment, and an item below the bottom band can't be leased at all.
 */
export function downPaymentBounds(
  table: CoefficientTable,
  listPriceCents: number
): DownPaymentBounds {
  const lowest = Math.min(...table.bands.map((b) => b.min_financed_cents));
  const highest = Math.max(...table.bands.map((b) => b.max_financed_cents));
  if (listPriceCents < lowest) return { ok: false, reason: 'below_minimum' };

  const step = DOWN_PAYMENT_STEP_CENTS;
  const minCents = Math.ceil(Math.max(0, listPriceCents - highest) / step) * step;
  const maxCents = Math.floor((listPriceCents - lowest) / step) * step;
  return { ok: true, minCents, maxCents, stepCents: step };
}

export interface BandEdgeHint {
  downPaymentCents: number;
  monthlyNetRentCents: number;
  savingPerMonthCents: number;
}

/**
 * At a band edge a bigger down payment can raise the rent (D-013). Within a band, less down
 * means more rent, so the only cheaper option is the next band up: the largest down payment
 * (on a slider step) that still keeps the financed amount in it. Returns it when it lowers the
 * rent; otherwise null.
 */
export function bandEdgeHint(table: CoefficientTable, input: QuoteInput): BandEdgeHint | null {
  const current = quoteLease(table, input);
  if (!current.ok) return null;
  const nextBand = table.bands
    .filter((b) => b.min_financed_cents > current.financedCents)
    .sort((a, b) => a.min_financed_cents - b.min_financed_cents)[0];
  if (!nextBand) return null;

  const step = DOWN_PAYMENT_STEP_CENTS;
  const downPaymentCents =
    Math.floor((input.listPriceCents - nextBand.min_financed_cents) / step) * step;
  if (downPaymentCents < 0 || downPaymentCents >= input.downPaymentCents) return null;
  const cheaper = quoteLease(table, { ...input, downPaymentCents });
  if (!cheaper.ok || cheaper.monthlyNetRentCents >= current.monthlyNetRentCents) return null;
  return {
    downPaymentCents,
    monthlyNetRentCents: cheaper.monthlyNetRentCents,
    savingPerMonthCents: current.monthlyNetRentCents - cheaper.monthlyNetRentCents,
  };
}
