// A quote: list price + down payment + term → financed amount, band, monthly net rent,
// net total and buyout. Rounding policy (docs/DECISIONS.md): the factor is held as integer
// parts per million, every derived amount is rounded half-up exactly once, and the last
// month absorbs the leftover cents so the months add up to the net total to the cent.
import type { CoefficientTable } from '@/data/schemas';
import { monthlyFactorFor } from './coefficient';
import { divideHalfUp } from './rounding';

/** Down payment cap: at most this share of the net list price (docs/DECISIONS.md). */
export const DOWN_PAYMENT_MAX_PERCENT = 30;

export type Quote = {
  listPriceCents: number;
  downPaymentCents: number;
  financedCents: number;
  termMonths: number;
  band: string;
  annualInterestPercent: number;
  /** The data-pack factor × 1 000 000, e.g. 0.027584 → 27584. */
  factorPpm: number;
  monthlyNetRentCents: number;
  /** financed × factorPpm × term / 1 000 000, rounded half-up once. */
  netTotalCents: number;
  /** monthlyNetRentCents plus the leftover cents; invoice `termMonths` uses this. */
  lastMonthNetRentCents: number;
  buyoutNetCents: number;
};

export type QuoteResult =
  | { ok: true; quote: Quote }
  | {
      ok: false;
      reason:
        | 'below_minimum'
        | 'above_maximum'
        | 'unknown_term'
        | 'down_payment_negative'
        | 'down_payment_over_max';
    };

/**
 * The largest allowed down payment for a list price: 30 % of it (whole cents, rounded down),
 * and never so much that the financed amount falls under the table's smallest band.
 */
export function maxDownPaymentCents(listPriceCents: number, table: CoefficientTable): number {
  const minFinanced = Math.min(...table.bands.map((b) => b.min_financed_cents));
  const capByShare = Math.floor((listPriceCents * DOWN_PAYMENT_MAX_PERCENT) / 100);
  return Math.max(0, Math.min(capByShare, listPriceCents - minFinanced));
}

export function quoteFor(input: {
  listPriceCents: number;
  downPaymentCents: number;
  termMonths: number;
  table: CoefficientTable;
}): QuoteResult {
  const { listPriceCents, downPaymentCents, termMonths, table } = input;
  if (!Number.isInteger(listPriceCents) || !Number.isInteger(downPaymentCents)) {
    throw new RangeError('money must be whole cents');
  }
  if (downPaymentCents < 0) return { ok: false, reason: 'down_payment_negative' };
  if (downPaymentCents > Math.floor((listPriceCents * DOWN_PAYMENT_MAX_PERCENT) / 100)) {
    return { ok: false, reason: 'down_payment_over_max' };
  }

  const financedCents = listPriceCents - downPaymentCents;
  const factorResult = monthlyFactorFor(table, financedCents, termMonths);
  if (!factorResult.ok) return { ok: false, reason: factorResult.reason };

  const buyoutPercent = table.end_of_term_buyout_percent_of_financed[String(termMonths)];
  if (buyoutPercent === undefined) return { ok: false, reason: 'unknown_term' };

  const factorPpm = Math.round(factorResult.factor * 1_000_000);
  const monthlyNetRentCents = divideHalfUp(financedCents * factorPpm, 1_000_000);
  const netTotalCents = divideHalfUp(financedCents * factorPpm * termMonths, 1_000_000);
  const lastMonthNetRentCents = netTotalCents - monthlyNetRentCents * (termMonths - 1);
  // Buyout percent as basis points, so 15 % of 389 000 is exact integer maths.
  const buyoutNetCents = divideHalfUp(financedCents * Math.round(buyoutPercent * 100), 10_000);

  return {
    ok: true,
    quote: {
      listPriceCents,
      downPaymentCents,
      financedCents,
      termMonths,
      band: factorResult.band.band,
      annualInterestPercent: factorResult.band.annual_interest_percent,
      factorPpm,
      monthlyNetRentCents,
      netTotalCents,
      lastMonthNetRentCents,
      buyoutNetCents,
    },
  };
}
