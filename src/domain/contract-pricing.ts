// Pure contract pricing.
//
// Rounding rule (documented per RULES.md, ARCHITECTURE.md §6.1):
// All monetary inputs and outputs are integer euro cents, and rates are integers
// (factor in ppm, VAT in basis points). Each derived amount (`monthlyNetRentCents`,
// `monthlyVatCents`, `buyoutNetCents`) is rounded once, half up, by `mulDivRound`,
// matching the worked example in `data/DATA.md`:
//   389 000 × 0.027584 = 10 730.176 → 10 730 cents
//   10 730 × 25.5 %    =  2 736.15  →  2 736 cents
//   10 730 + 2 736     = 13 466 cents
import type { CoefficientBand, CoefficientTable, VatRates } from '@/data/schemas';
import { monthlyFactorFor, monthlyNetRentFor } from './coefficient';
import { LEASE_CONFIG } from './config';
import { fractionToPpm, mulDivRound, percentToBp } from './rounding';
import { generateSchedule } from './schedule';
import { vatRateOn } from './vat';

/** Default down payment slider step: 5 000 cents (€50.00). */
export const DEFAULT_DOWN_PAYMENT_STEP_CENTS = LEASE_CONFIG.downPaymentStepCents;

// VAT lookup lives in ./vat; re-exported so existing imports keep working.
export { vatRateOn, type VatRateResult } from './vat';

/**
 * Returns the sorted lease terms (in months) supported by a coefficient table,
 * e.g. `[12, 24, 36, 48]`.
 */
export function availableTermsFromTable(table: CoefficientTable): number[] {
  return Object.keys(table.end_of_term_buyout_percent_of_financed)
    .map((key) => Number(key))
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);
}

export type DownPaymentBounds = {
  minCents: number;
  maxCents: number;
  stepCents: number;
};

/**
 * Calculates the slider bounds for a net down payment given `listPriceCents`.
 * Caps `maxCents` so at least the lowest financeable amount in `table` remains financed
 * (when `listPriceCents` itself is above that minimum), rounded down to `stepCents`.
 */
export function downPaymentBoundsFor(
  table: CoefficientTable,
  listPriceCents: number,
  stepCents: number = DEFAULT_DOWN_PAYMENT_STEP_CENTS
): DownPaymentBounds {
  if (!Number.isInteger(listPriceCents) || listPriceCents < 0) {
    throw new RangeError(`listPriceCents must be a non-negative integer, got ${listPriceCents}`);
  }
  if (!Number.isInteger(stepCents) || stepCents <= 0) {
    throw new RangeError(`stepCents must be a positive integer, got ${stepCents}`);
  }

  const lowestFinancedCents = Math.min(...table.bands.map((b) => b.min_financed_cents));
  if (listPriceCents <= lowestFinancedCents) {
    return { minCents: 0, maxCents: 0, stepCents };
  }

  const rawMax = listPriceCents - lowestFinancedCents;
  const maxCents = Math.floor(rawMax / stepCents) * stepCents;
  return { minCents: 0, maxCents, stepCents };
}

/** Clamps a down payment in cents to `[bounds.minCents, bounds.maxCents]`. */
export function clampDownPaymentCents(
  downPaymentCents: number,
  bounds: Pick<DownPaymentBounds, 'minCents' | 'maxCents'>
): number {
  if (!Number.isInteger(downPaymentCents)) {
    throw new RangeError(`downPaymentCents must be whole cents, got ${downPaymentCents}`);
  }
  return Math.min(Math.max(downPaymentCents, bounds.minCents), bounds.maxCents);
}

export type ContractQuoteInput = {
  listPriceCents: number;
  priceListVersion: number;
  downPaymentCents: number;
  termMonths: number;
  isoDate: string;
  coefficientTable: CoefficientTable;
  vatRates: VatRates;
};

export type ContractQuote = {
  isoDate: string;
  listPriceCents: number;
  priceListVersion: number;
  downPaymentCents: number;
  financedCents: number;
  termMonths: number;
  band: CoefficientBand;
  factor: number;
  /** The factor in parts per million (0.027584 → 27 584), as stored on the quote. */
  factorPpm: number;
  /** The band's annual interest in basis points (7.9 % → 790). */
  annualInterestBp: number;
  monthlyNetRentCents: number;
  vatRatePercent: number;
  /** VAT on the quote date in basis points (25.5 % → 2550). */
  vatRateBp: number;
  vatRateFictional: boolean;
  monthlyVatCents: number;
  monthlyGrossRentCents: number;
  buyoutPercent: number;
  buyoutNetCents: number;
  totalRentNetCents: number;
  /** Sum of every rent invoice's gross, each with VAT on its own invoice date. */
  totalRentGrossCents: number;
  totalLeaseNetCents: number;
  totalWithBuyoutNetCents: number;
};

export type ContractQuoteFailureReason =
  | 'invalid_down_payment'
  | 'below_minimum'
  | 'above_maximum'
  | 'unknown_term'
  | 'no_vat_rate_on_date';

export type ContractQuoteResult =
  | { ok: true; quote: ContractQuote }
  | { ok: false; reason: ContractQuoteFailureReason; financedCents: number };

/**
 * Computes a complete lease contract quote for a given asset price, down payment, term, and date.
 */
export function calculateContractQuote(input: ContractQuoteInput): ContractQuoteResult {
  const {
    listPriceCents,
    priceListVersion,
    downPaymentCents,
    termMonths,
    isoDate,
    coefficientTable,
    vatRates,
  } = input;

  if (!Number.isInteger(listPriceCents) || listPriceCents < 0) {
    throw new RangeError(`listPriceCents must be a non-negative integer, got ${listPriceCents}`);
  }
  if (!Number.isInteger(downPaymentCents)) {
    throw new RangeError(`downPaymentCents must be whole cents, got ${downPaymentCents}`);
  }

  const financedCents = listPriceCents - downPaymentCents;
  if (downPaymentCents < 0 || downPaymentCents > listPriceCents) {
    return { ok: false, reason: 'invalid_down_payment', financedCents };
  }

  const factorResult = monthlyFactorFor(coefficientTable, financedCents, termMonths);
  if (!factorResult.ok) {
    return { ok: false, reason: factorResult.reason, financedCents };
  }

  const buyoutPercent = coefficientTable.end_of_term_buyout_percent_of_financed[String(termMonths)];
  if (buyoutPercent === undefined) {
    return { ok: false, reason: 'unknown_term', financedCents };
  }

  const vatResult = vatRateOn(vatRates, isoDate);
  if (!vatResult.ok) {
    return { ok: false, reason: 'no_vat_rate_on_date', financedCents };
  }

  const monthlyNetRentCents = monthlyNetRentFor(financedCents, factorResult.factor);
  // VAT on the quote date, for display. Each invoice gets its own date's rate.
  const monthlyVatCents = mulDivRound(monthlyNetRentCents, vatResult.rateBp, 10_000);
  const monthlyGrossRentCents = monthlyNetRentCents + monthlyVatCents;
  const buyoutNetCents = mulDivRound(financedCents, buyoutPercent, 100);
  const totalRentNetCents = monthlyNetRentCents * termMonths;
  // The VAT rate can change during the term, so the gross total is the sum of the rows.
  const totalRentGrossCents = generateSchedule(
    { startDate: isoDate, termMonths, monthlyNetRentCents, downPaymentCents: 0 },
    vatRates
  ).totalGrossCents;
  const totalLeaseNetCents = downPaymentCents + totalRentNetCents;
  const totalWithBuyoutNetCents = totalLeaseNetCents + buyoutNetCents;

  return {
    ok: true,
    quote: {
      isoDate,
      listPriceCents,
      priceListVersion,
      downPaymentCents,
      financedCents,
      termMonths,
      band: factorResult.band,
      factor: factorResult.factor,
      factorPpm: fractionToPpm(factorResult.factor),
      annualInterestBp: percentToBp(factorResult.band.annual_interest_percent),
      monthlyNetRentCents,
      vatRatePercent: vatResult.ratePercent,
      vatRateBp: vatResult.rateBp,
      vatRateFictional: vatResult.fictional,
      monthlyVatCents,
      monthlyGrossRentCents,
      buyoutPercent,
      buyoutNetCents,
      totalRentNetCents,
      totalRentGrossCents,
      totalLeaseNetCents,
      totalWithBuyoutNetCents,
    },
  };
}
