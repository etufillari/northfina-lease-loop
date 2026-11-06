// The affordability rule from data/questions.json: a consumer's monthly rent including VAT
// must stay within 30 % of their monthly net income. Income is only asked for deals of
// €2,000 and up, so an unknown income passes — the bank chose not to ask (docs/DECISIONS.md).
import type { CoefficientTable } from '@/data/schemas';
import { quoteFor } from './pricing';
import { divideHalfUp } from './rounding';
import { grossCents } from './vat';

export const AFFORDABILITY_MAX_PERCENT = 30;

export type AffordabilityResult =
  | { status: 'passed'; limitCents: number }
  | { status: 'failed'; limitCents: number }
  | { status: 'not_assessed'; reason: 'income_not_asked' | 'not_a_consumer' };

export function checkAffordability(input: {
  monthlyRentWithVatCents: number;
  /** `null` when the income question was never asked. */
  monthlyNetIncomeCents: number | null;
  isConsumer: boolean;
}): AffordabilityResult {
  if (!input.isConsumer) return { status: 'not_assessed', reason: 'not_a_consumer' };
  if (input.monthlyNetIncomeCents === null) {
    return { status: 'not_assessed', reason: 'income_not_asked' };
  }
  const limitCents = divideHalfUp(input.monthlyNetIncomeCents * AFFORDABILITY_MAX_PERCENT, 100);
  return input.monthlyRentWithVatCents <= limitCents
    ? { status: 'passed', limitCents }
    : { status: 'failed', limitCents };
}

/** One payment a customer makes: an invoice total incl. VAT on its due date. */
export type Payment = { dueDate: string; totalCents: number };

export type TermAffordabilityResult =
  | {
      status: 'passed';
      limitCents: number;
      /** The heaviest month, new lease and existing ones together. */
      peakMonth: string;
      peakCents: number;
    }
  | {
      status: 'failed';
      limitCents: number;
      /** The first month over the limit (YYYY-MM) and what is due in it. */
      month: string;
      totalCents: number;
      newCents: number;
      existingCents: number;
    }
  | { status: 'not_assessed'; reason: 'income_not_asked' | 'not_a_consumer' };

/**
 * The 30 % rule over the WHOLE lease, not just its first month: every calendar month the new
 * lease bills, what is due in it — the new lease's invoice (VAT at that date's rate, so the
 * January 2027 rise counts) plus every invoice the customer already pays on their other
 * leases — must stay within 30 % of monthly net income. One month over is a decline, and the
 * reason names the month. Income is asked from €2,000 up; below that it is not assessed.
 */
export function checkAffordabilityOverTerm(input: {
  newPayments: readonly Payment[];
  existingPayments: readonly Payment[];
  monthlyNetIncomeCents: number | null;
  isConsumer: boolean;
}): TermAffordabilityResult {
  if (!input.isConsumer) return { status: 'not_assessed', reason: 'not_a_consumer' };
  if (input.monthlyNetIncomeCents === null) {
    return { status: 'not_assessed', reason: 'income_not_asked' };
  }
  const limitCents = divideHalfUp(input.monthlyNetIncomeCents * AFFORDABILITY_MAX_PERCENT, 100);
  const byMonth = (payments: readonly Payment[]) => {
    const months = new Map<string, number>();
    for (const p of payments) {
      const month = p.dueDate.slice(0, 7);
      months.set(month, (months.get(month) ?? 0) + p.totalCents);
    }
    return months;
  };
  const fresh = byMonth(input.newPayments);
  const existing = byMonth(input.existingPayments);

  let peakMonth = '';
  let peakCents = -1;
  for (const month of [...fresh.keys()].sort()) {
    const newCents = fresh.get(month)!;
    const existingCents = existing.get(month) ?? 0;
    const totalCents = newCents + existingCents;
    if (totalCents > limitCents) {
      return { status: 'failed', limitCents, month, totalCents, newCents, existingCents };
    }
    if (totalCents > peakCents) {
      peakMonth = month;
      peakCents = totalCents;
    }
  }
  return { status: 'passed', limitCents, peakMonth, peakCents: Math.max(peakCents, 0) };
}

export type AffordableSuggestion = {
  termMonths: number;
  downPaymentCents: number;
  monthlyNetRentCents: number;
  monthlyRentWithVatCents: number;
};

/**
 * The gentlest change that would pass the 30 % rule: first a longer term with the same down
 * payment, then (per term, shortest first) a larger down payment in 5 %-of-list steps up to
 * the 30 % cap. Returns `null` when nothing passes — the UI then simply lets the customer
 * apply and be declined, because a hard pre-consent rejection is not allowed.
 */
export function suggestAffordableParameters(input: {
  listPriceCents: number;
  downPaymentCents: number;
  termMonths: number;
  monthlyNetIncomeCents: number;
  vatRateBasisPoints: number;
  table: CoefficientTable;
  /** The most the customer already pays in one month on other leases (incl. VAT). */
  existingMonthlyCents?: number;
}): AffordableSuggestion | null {
  const terms = Object.keys(input.table.end_of_term_buyout_percent_of_financed)
    .map(Number)
    .sort((a, b) => a - b);
  const downSteps: number[] = [];
  for (let percent = 5; percent <= 30; percent += 5) {
    downSteps.push(Math.floor((input.listPriceCents * percent) / 100));
  }

  const candidates: Array<{ termMonths: number; downPaymentCents: number }> = [
    ...terms
      .filter((t) => t > input.termMonths)
      .map((t) => ({ termMonths: t, downPaymentCents: input.downPaymentCents })),
    ...terms.flatMap((t) =>
      downSteps
        .filter((down) => down > input.downPaymentCents)
        .map((down) => ({ termMonths: t, downPaymentCents: down }))
    ),
  ];

  for (const candidate of candidates) {
    const result = quoteFor({
      listPriceCents: input.listPriceCents,
      downPaymentCents: candidate.downPaymentCents,
      termMonths: candidate.termMonths,
      table: input.table,
    });
    if (!result.ok) continue;
    const monthlyRentWithVatCents = grossCents(
      result.quote.monthlyNetRentCents,
      input.vatRateBasisPoints
    );
    const check = checkAffordability({
      monthlyRentWithVatCents: monthlyRentWithVatCents + (input.existingMonthlyCents ?? 0),
      monthlyNetIncomeCents: input.monthlyNetIncomeCents,
      isConsumer: true,
    });
    if (check.status === 'passed') {
      return {
        termMonths: candidate.termMonths,
        downPaymentCents: candidate.downPaymentCents,
        monthlyNetRentCents: result.quote.monthlyNetRentCents,
        monthlyRentWithVatCents,
      };
    }
  }
  return null;
}
