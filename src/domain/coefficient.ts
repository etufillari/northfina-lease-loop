// Worked example 1: look up the monthly rent factor in the coefficient table.
// monthly net rent (cents) = financed amount (cents) × factor, rounded once, half up,
// in integer arithmetic: mulDivRound(financed, factorPpm, 1 000 000). See ./rounding.
import type { CoefficientBand, CoefficientTable } from '@/data/schemas';
import { fractionToPpm, mulDivRound } from './rounding';

export type MonthlyFactorResult =
  | { ok: true; band: CoefficientBand; factor: number }
  | { ok: false; reason: 'below_minimum' | 'above_maximum' | 'unknown_term' };

/**
 * Finds the band for `financedCents` and the factor for `termMonths` in that band.
 * Both band limits are inclusive: 199 999 cents is band A, 200 000 cents is band B.
 *
 * Returns a result instead of throwing, because "this amount cannot be financed" is a
 * normal business answer that the UI must show, not a bug.
 */
export function monthlyFactorFor(
  table: CoefficientTable,
  financedCents: number,
  termMonths: number
): MonthlyFactorResult {
  if (!Number.isInteger(financedCents)) {
    // A non-integer here is a programming error: money is always whole cents.
    throw new RangeError(`financedCents must be whole cents, got ${financedCents}`);
  }

  const band = table.bands.find(
    (b) => financedCents >= b.min_financed_cents && financedCents <= b.max_financed_cents
  );
  if (!band) {
    const lowest = Math.min(...table.bands.map((b) => b.min_financed_cents));
    return { ok: false, reason: financedCents < lowest ? 'below_minimum' : 'above_maximum' };
  }

  const factor = band.monthly_factor_by_term[String(termMonths)];
  if (factor === undefined) return { ok: false, reason: 'unknown_term' };

  return { ok: true, band, factor };
}

/**
 * Monthly net rent in cents for a financed amount and a table factor:
 * `mulDivRound(financedCents, factor in ppm, 1 000 000)`. 389 000 × 0.027584 → 10 730.
 * Throws if the factor has more precision than parts per million.
 */
export function monthlyNetRentFor(financedCents: number, factor: number): number {
  return mulDivRound(financedCents, fractionToPpm(factor), 1_000_000);
}
