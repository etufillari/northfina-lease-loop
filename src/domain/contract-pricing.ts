// Pure contract pricing and VAT lookup functions.
//
// Rounding rule (documented per RULES.md):
// All monetary inputs and outputs are integer euro cents. Derived cent amounts
// (`monthlyNetRentCents`, `monthlyVatCents`, `buyoutNetCents`) are rounded once
// using `Math.round` (half-up to the nearest cent for positive numbers), matching
// the worked example in `data/DATA.md`:
//   389 000 × 0.027584 = 10 730.176 → 10 730 cents
//   10 730 × 25.5 %    =  2 736.15  →  2 736 cents
//   10 730 + 2 736     = 13 466 cents
import type { CoefficientBand, CoefficientTable, VatRates } from '@/data/schemas';
import { monthlyFactorFor } from './coefficient';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Default down payment slider step: 5 000 cents (€50.00). */
export const DEFAULT_DOWN_PAYMENT_STEP_CENTS = 5_000;

export type VatRateResult =
  | { ok: true; ratePercent: number; fictional: boolean }
  | { ok: false; reason: 'no_vat_rate_on_date' };

/**
 * Looks up the general VAT rate in effect on `isoDate` (`YYYY-MM-DD`).
 * Both `valid_from` and `valid_to` are inclusive; `valid_to: null` means open-ended.
 */
export function vatRateOn(vatRates: VatRates, isoDate: string): VatRateResult {
  if (!ISO_DATE.test(isoDate)) {
    throw new RangeError(`isoDate must look like YYYY-MM-DD, got "${isoDate}"`);
  }

  const rate = vatRates.rates.find(
    (r) => r.valid_from <= isoDate && (r.valid_to === null || isoDate <= r.valid_to)
  );
  if (!rate) return { ok: false, reason: 'no_vat_rate_on_date' };

  return {
    ok: true,
    ratePercent: rate.rate_percent,
    fictional: Boolean(rate.fictional),
  };
}

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
  monthlyNetRentCents: number;
  vatRatePercent: number;
  vatRateFictional: boolean;
  monthlyVatCents: number;
  monthlyGrossRentCents: number;
  buyoutPercent: number;
  buyoutNetCents: number;
  totalRentNetCents: number;
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

  const monthlyNetRentCents = Math.round(financedCents * factorResult.factor);
  const monthlyVatCents = Math.round((monthlyNetRentCents * vatResult.ratePercent) / 100);
  const monthlyGrossRentCents = monthlyNetRentCents + monthlyVatCents;
  const buyoutNetCents = Math.round((financedCents * buyoutPercent) / 100);
  const totalRentNetCents = monthlyNetRentCents * termMonths;
  const totalRentGrossCents = monthlyGrossRentCents * termMonths;
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
      monthlyNetRentCents,
      vatRatePercent: vatResult.ratePercent,
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
