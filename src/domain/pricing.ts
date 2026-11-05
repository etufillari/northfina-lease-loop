// The monthly lease price: from a list price, down payment and term to the monthly rent,
// VAT, buyout and totals. Follows the DATA.md worked example exactly.
//
// Rounding rule: each amount is computed from whole-cent inputs and rounded ONCE, half up,
// to a whole cent (see multiplyCents / percentOfCents in money.ts). Totals are sums of
// already-rounded amounts, so a total always equals what the customer actually pays.
import type { CoefficientTable } from '@/data/schemas';
import { monthlyFactorFor } from './coefficient';
import { multiplyCents, percentOfCents } from './money';

/** The lease terms on offer, in months, shortest first (12, 24, 36, 48 in the data pack). */
export function leaseTerms(table: CoefficientTable): number[] {
  return Object.keys(table.end_of_term_buyout_percent_of_financed)
    .map(Number)
    .sort((a, b) => a - b);
}

export type DownPaymentRange =
  | { ok: true; minCents: number; maxCents: number; stepCents: number }
  | { ok: false; reason: 'below_minimum' };

/** Slider step: €10 under €10,000, €100 under €100,000, €1,000 above. */
function downPaymentStep(listPriceCents: number): number {
  if (listPriceCents < 1_000_000) return 1_000;
  if (listPriceCents < 10_000_000) return 10_000;
  return 100_000;
}

/**
 * Which down payments make the item leasable. The financed amount (list price − down
 * payment) must land inside one of the coefficient bands, so:
 * - the most you can put down leaves the smallest financeable amount;
 * - the least you can put down brings an expensive item under the largest band's maximum
 *   (e.g. a €260,000 machine needs at least €10,000 down when bands stop at €250,000).
 * Both ends are snapped to the slider step, inwards, so every slider position is valid.
 * An item cheaper than the smallest band can't be leased at all.
 */
export function downPaymentRange(
  listPriceCents: number,
  table: CoefficientTable
): DownPaymentRange {
  const lowest = Math.min(...table.bands.map((b) => b.min_financed_cents));
  const highest = Math.max(...table.bands.map((b) => b.max_financed_cents));
  if (listPriceCents < lowest) return { ok: false, reason: 'below_minimum' };

  const stepCents = downPaymentStep(listPriceCents);
  const minCents = Math.ceil(Math.max(0, listPriceCents - highest) / stepCents) * stepCents;
  const maxCents = Math.floor((listPriceCents - lowest) / stepCents) * stepCents;
  return { ok: true, minCents, maxCents: Math.max(minCents, maxCents), stepCents };
}

export type LeaseQuote = {
  listPriceCents: number;
  downPaymentCents: number;
  /** List price − down payment: the amount the rent is calculated from. */
  financedCents: number;
  termMonths: number;
  band: string;
  annualInterestPercent: number;
  factor: number;
  monthlyNetCents: number;
  vatPercent: number;
  monthlyVatCents: number;
  monthlyGrossCents: number;
  /** All monthly rents together, excluding and including VAT at today's rate. */
  totalNetRentCents: number;
  totalGrossRentCents: number;
  /** Price to buy the item at the end of the term (net), as set by the coefficient table. */
  buyoutPercent: number;
  buyoutNetCents: number;
};

export type QuoteResult =
  | { ok: true; quote: LeaseQuote }
  | {
      ok: false;
      reason: 'down_payment_too_large' | 'below_minimum' | 'above_maximum' | 'unknown_term';
    };

export type QuoteInput = {
  listPriceCents: number;
  downPaymentCents: number;
  termMonths: number;
  /** VAT rate on the quote date, e.g. 25.5. The caller looks it up with vatPercentOn. */
  vatPercent: number;
};

/**
 * Quotes a lease. Worked example (DATA.md): ebike-003, 389000 list, no down payment,
 * 36 months, 25.5 % VAT → band B, factor 0.027584, 10730 net + 2736 VAT = 13466 a month,
 * buyout 15 % = 58350.
 *
 * VAT is today's rate. Invoices charge the rate on their own date, so a later VAT change
 * changes the total even though the net rent is locked.
 */
export function quoteLease(input: QuoteInput, table: CoefficientTable): QuoteResult {
  const { listPriceCents, downPaymentCents, termMonths, vatPercent } = input;
  if (!Number.isInteger(downPaymentCents) || downPaymentCents < 0) {
    throw new RangeError(`downPaymentCents must be whole, non-negative cents`);
  }
  if (downPaymentCents > listPriceCents) return { ok: false, reason: 'down_payment_too_large' };

  const financedCents = listPriceCents - downPaymentCents;
  const factorResult = monthlyFactorFor(table, financedCents, termMonths);
  if (!factorResult.ok) return factorResult;

  const buyoutPercent = table.end_of_term_buyout_percent_of_financed[String(termMonths)];
  if (buyoutPercent === undefined) return { ok: false, reason: 'unknown_term' };

  const monthlyNetCents = multiplyCents(financedCents, factorResult.factor);
  const monthlyVatCents = percentOfCents(monthlyNetCents, vatPercent);
  const monthlyGrossCents = monthlyNetCents + monthlyVatCents;

  return {
    ok: true,
    quote: {
      listPriceCents,
      downPaymentCents,
      financedCents,
      termMonths,
      band: factorResult.band.band,
      annualInterestPercent: factorResult.band.annual_interest_percent,
      factor: factorResult.factor,
      monthlyNetCents,
      vatPercent,
      monthlyVatCents,
      monthlyGrossCents,
      totalNetRentCents: monthlyNetCents * termMonths,
      totalGrossRentCents: monthlyGrossCents * termMonths,
      buyoutPercent,
      buyoutNetCents: percentOfCents(financedCents, buyoutPercent),
    },
  };
}
