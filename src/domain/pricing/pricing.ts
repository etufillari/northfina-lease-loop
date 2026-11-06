// Prices a deal. All amounts are net: VAT follows the invoice date, so it is not part of a quote.
import type { Quote, QuoteResult } from '@/data/lease-schemas';
import type { CoefficientTable } from '@/data/schemas';
import { monthlyFactorFor } from './coefficient';
import { BASIS_POINTS_PER_WHOLE, roundedDivide } from '../money';
import { vatCents } from '../vat';

const MICROS_PER_WHOLE = 1_000_000;

export type QuoteInput = {
  /** The list price, or the relist price of a used item. */
  basePriceCents: number;
  /** `null` when the base price does not come from a price list. */
  priceListVersion: number | null;
  downPaymentCents: number;
  termMonths: number;
};

/** The term the item page starts on, and the one catalogue estimates use. */
export const DEFAULT_TERM_MONTHS = 36;

export type DownPaymentLimitsResult =
  { ok: true; minCents: number; maxCents: number } | { ok: false; reason: 'below_minimum' };

/**
 * The down payments that keep the financed amount inside the table, for a slider.
 * The table's smallest and largest financed amounts decide, so the limits follow the data.
 * `ok: false` means the price is under the minimum, so no down payment can make the deal valid.
 * The limits do not depend on the term.
 */
export function downPaymentLimits(
  table: CoefficientTable,
  basePriceCents: number
): DownPaymentLimitsResult {
  if (!Number.isInteger(basePriceCents) || basePriceCents < 0) {
    throw new RangeError(`basePriceCents must be whole cents, got ${basePriceCents}`);
  }
  const minFinanced = Math.min(...table.bands.map((b) => b.min_financed_cents));
  const maxFinanced = Math.max(...table.bands.map((b) => b.max_financed_cents));

  if (basePriceCents < minFinanced) return { ok: false, reason: 'below_minimum' };
  return {
    ok: true,
    minCents: Math.max(0, basePriceCents - maxFinanced),
    maxCents: basePriceCents - minFinanced,
  };
}

/**
 * Rent and buyout for a deal. Each is rounded once, half up (see `roundedDivide`).
 * Limits apply to the financed amount, not the list price, so a down payment can bring
 * a too-expensive item into range or push a cheap one below the minimum.
 */
export function quote(table: CoefficientTable, input: QuoteInput): QuoteResult {
  const { basePriceCents, priceListVersion, downPaymentCents, termMonths } = input;

  if (downPaymentCents > basePriceCents) return { ok: false, reason: 'down_payment_too_high' };
  const financedCents = basePriceCents - downPaymentCents;

  const match = monthlyFactorFor(table, financedCents, termMonths);
  if (!match.ok) return match;

  const buyoutPercent = table.end_of_term_buyout_percent_of_financed[String(termMonths)];
  if (buyoutPercent === undefined) return { ok: false, reason: 'unknown_term' };

  // The table holds decimals. Converting them here keeps the arithmetic below in whole numbers.
  const factorMicros = Math.round(match.factor * MICROS_PER_WHOLE);
  const buyoutBasisPoints = Math.round(buyoutPercent * 100);

  return {
    ok: true,
    quote: {
      price_list_version: priceListVersion,
      base_price_cents: basePriceCents,
      down_payment_cents: downPaymentCents,
      financed_cents: financedCents,
      term_months: termMonths,
      band: match.band.band,
      factor_micros: factorMicros,
      annual_interest_basis_points: Math.round(match.band.annual_interest_percent * 100),
      monthly_net_rent_cents: roundedDivide(financedCents * factorMicros, MICROS_PER_WHOLE),
      buyout_cents: roundedDivide(financedCents * buyoutBasisPoints, BASIS_POINTS_PER_WHOLE),
    },
  };
}

export type LeaseEstimate = {
  monthlyTotalCents: number;
  termMonths: number;
  /** The item cannot be leased with nothing down, so the rent assumes the minimum. */
  requiresDownPayment: boolean;
};

/**
 * A catalogue estimate: the monthly rent with VAT at the default term, with the smallest down
 * payment the item allows. `null` when the price cannot be financed at all. The VAT rate is
 * the one given, so a lease running past a rate change will cost a little more or less.
 */
export function leaseEstimate(
  table: CoefficientTable,
  basePriceCents: number,
  vatRateBasisPoints: number
): LeaseEstimate | null {
  const limits = downPaymentLimits(table, basePriceCents);
  if (!limits.ok) return null;

  const result = quote(table, {
    basePriceCents,
    priceListVersion: null,
    downPaymentCents: limits.minCents,
    termMonths: DEFAULT_TERM_MONTHS,
  });
  if (!result.ok) return null;

  const rent = result.quote.monthly_net_rent_cents;
  return {
    monthlyTotalCents: rent + vatCents(rent, vatRateBasisPoints),
    termMonths: DEFAULT_TERM_MONTHS,
    requiresDownPayment: limits.minCents > 0,
  };
}

/** What a lease adds up to before VAT, which depends on each invoice's date. */
export type LeaseTotals = { total_if_returned_cents: number; total_if_bought_cents: number };

/** The down payment plus every rent is what returning costs. Keeping the item adds the buyout. */
export function leaseTotals(
  deal: Pick<
    Quote,
    'down_payment_cents' | 'monthly_net_rent_cents' | 'term_months' | 'buyout_cents'
  >
): LeaseTotals {
  const ifReturned = deal.down_payment_cents + deal.monthly_net_rent_cents * deal.term_months;
  return {
    total_if_returned_cents: ifReturned,
    total_if_bought_cents: ifReturned + deal.buyout_cents,
  };
}
