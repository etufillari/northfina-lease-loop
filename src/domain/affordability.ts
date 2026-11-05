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
      monthlyRentWithVatCents,
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
