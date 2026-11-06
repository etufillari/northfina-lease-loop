// Fair early exit (Smart Problem 2), the tier re-price model from docs/DECISIONS.md:
// the months actually used — at least MIN_CHARGED_MONTHS — are re-priced at the cheapest term
// in the coefficient table that covers them, i.e. what the customer SHOULD have paid had they
// committed only that long, plus a handling fee of HANDLING_FEE_MONTHS months of that tier's
// rent. The result is capped at the remaining contract payments (leaving can never cost more
// than staying) and floored at 0. VAT is charged at the exit date's rate. At the full term
// the cost is 0: a plain return.
import type { CoefficientTable, VatRates } from '@/data/schemas';
import { quoteFor } from './pricing';
import { vatCents, vatRateOn } from './vat';

/** An early exit always pays for at least this many months of use. */
export const MIN_CHARGED_MONTHS = 6;
/** The handling fee, in months of the re-priced tier's rent. */
export const HANDLING_FEE_MONTHS = 2;

export type EarlyExitBreakdown = {
  usedMonths: number;
  /** The months paid for: the months used, but never fewer than MIN_CHARGED_MONTHS. */
  chargedMonths: number;
  /** The cheapest term in the table that covers the months charged (7 → 12). */
  coveringTermMonths: number;
  /** The monthly net rent the covering term would have cost for the same financed amount. */
  fairMonthlyNetCents: number;
  fairTotalNetCents: number;
  paidNetCents: number;
  handlingFeeNetCents: number;
  /** True when the cap kicked in: staying would have cost less than the raw re-price. */
  cappedAtRemaining: boolean;
  exitNetCents: number;
  vatRatePercent: number;
  exitVatCents: number;
  exitTotalCents: number;
};

export type EarlyExitResult =
  | { ok: true; breakdown: EarlyExitBreakdown }
  | { ok: false; reason: 'no_vat_rate_on_date' | 'unpriceable_amount' | 'bad_used_months' };

export function earlyExitQuote(input: {
  contract: { financedCents: number; termMonths: number; netTotalCents: number };
  /** Started months of use: an exit in month 7 means 7. */
  usedMonths: number;
  /** Net rent invoiced for those months (monthly × used, plus the last-month cents if any). */
  paidNetCents: number;
  exitDate: string;
  table: CoefficientTable;
  vatRates: VatRates;
}): EarlyExitResult {
  const { contract, usedMonths, paidNetCents, exitDate, table, vatRates } = input;
  if (!Number.isInteger(usedMonths) || usedMonths < 1 || usedMonths > contract.termMonths) {
    return { ok: false, reason: 'bad_used_months' };
  }
  const rate = vatRateOn(vatRates, exitDate);
  if (!rate.ok) return { ok: false, reason: rate.reason };

  // A full-term exit is a normal return and costs nothing.
  if (usedMonths === contract.termMonths) {
    return {
      ok: true,
      breakdown: {
        usedMonths,
        chargedMonths: usedMonths,
        coveringTermMonths: contract.termMonths,
        fairMonthlyNetCents: 0,
        fairTotalNetCents: 0,
        paidNetCents,
        handlingFeeNetCents: 0,
        cappedAtRemaining: false,
        exitNetCents: 0,
        vatRatePercent: rate.ratePercent,
        exitVatCents: 0,
        exitTotalCents: 0,
      },
    };
  }

  const terms = Object.keys(table.end_of_term_buyout_percent_of_financed)
    .map(Number)
    .sort((a, b) => a - b);
  const chargedMonths = Math.max(usedMonths, MIN_CHARGED_MONTHS);
  const coveringTermMonths = terms.find((t) => t >= chargedMonths) ?? terms[terms.length - 1]!;

  // Same financed amount, no down payment: the rent this customer would have had on the
  // covering term.
  const requote = quoteFor({
    listPriceCents: contract.financedCents,
    downPaymentCents: 0,
    termMonths: coveringTermMonths,
    table,
  });
  if (!requote.ok) return { ok: false, reason: 'unpriceable_amount' };

  const fairMonthlyNetCents = requote.quote.monthlyNetRentCents;
  const fairTotalNetCents = fairMonthlyNetCents * chargedMonths;
  const handlingFeeNetCents = fairMonthlyNetCents * HANDLING_FEE_MONTHS;
  const raw = fairTotalNetCents - paidNetCents + handlingFeeNetCents;
  const remaining = contract.netTotalCents - paidNetCents;
  const exitNetCents = Math.max(0, Math.min(raw, remaining));
  const exitVatCents = vatCents(exitNetCents, rate.rateBasisPoints);

  return {
    ok: true,
    breakdown: {
      usedMonths,
      chargedMonths,
      coveringTermMonths,
      fairMonthlyNetCents,
      fairTotalNetCents,
      paidNetCents,
      handlingFeeNetCents,
      cappedAtRemaining: raw > remaining,
      exitNetCents,
      vatRatePercent: rate.ratePercent,
      exitVatCents,
      exitTotalCents: exitNetCents + exitVatCents,
    },
  };
}
