import type { CoefficientBand, CoefficientTable } from '@/data/schemas';
import { monthlyFactorFor } from './coefficient';

export type LeasePriceResult =
  | {
      ok: true;
      netListPriceCents: number;
      downPaymentCents: number;
      financedCents: number;
      termMonths: number;
      band: CoefficientBand;
      factor: number;
      monthlyNetRentCents: number;
      buyoutPercent: number;
      endOfTermBuyoutCents: number;
      totalCostWithBuyoutCents: number;
    }
  | {
      ok: false;
      reason:
        'down_payment_exceeds_list_price' | 'below_minimum' | 'above_maximum' | 'unknown_term';
    };

function assertNonNegativeCents(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative whole number of cents, got ${value}`);
  }
}

/**
 * Calculates the net leasing price from a list price, down payment and coefficient table.
 *
 * The coefficient table is data-driven: any term present in both the selected band's
 * monthly_factor_by_term and the table's buyout map is supported without code changes.
 * Monetary products are rounded once to the nearest cent, with half-cent values rounded up.
 */
export function leasePriceFor(
  table: CoefficientTable,
  netListPriceCents: number,
  downPaymentCents: number,
  termMonths: number
): LeasePriceResult {
  assertNonNegativeCents('netListPriceCents', netListPriceCents);
  assertNonNegativeCents('downPaymentCents', downPaymentCents);

  if (downPaymentCents > netListPriceCents) {
    return { ok: false, reason: 'down_payment_exceeds_list_price' };
  }

  const financedCents = netListPriceCents - downPaymentCents;
  const factorResult = monthlyFactorFor(table, financedCents, termMonths);
  if (!factorResult.ok) return factorResult;

  const buyoutPercent = table.end_of_term_buyout_percent_of_financed[String(termMonths)];
  if (buyoutPercent === undefined) {
    return { ok: false, reason: 'unknown_term' };
  }

  // Both calculations use cents throughout and round exactly once after multiplication.
  const monthlyNetRentCents = Math.round(financedCents * factorResult.factor);
  const endOfTermBuyoutCents = Math.round((financedCents * buyoutPercent) / 100);
  const totalCostWithBuyoutCents =
    downPaymentCents + monthlyNetRentCents * termMonths + endOfTermBuyoutCents;

  return {
    ok: true,
    netListPriceCents,
    downPaymentCents,
    financedCents,
    termMonths,
    band: factorResult.band,
    factor: factorResult.factor,
    monthlyNetRentCents,
    buyoutPercent,
    endOfTermBuyoutCents,
    totalCostWithBuyoutCents,
  };
}
