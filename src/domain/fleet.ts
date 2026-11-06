// Fleet leasing (wildcard): a company leases several items at once, with one application, one
// decision and one signature. Every item still gets its own contract, priced on its own band
// exactly like a single lease, so invoices, end of term and second life work unchanged.
//
// Rules:
// - At least 2 and at most MAX_FLEET_ITEMS different items, all of one category, one term.
// - Fleets are for businesses (companies and sole traders), not private persons.
// - The questions and the decision look at the fleet as one deal: its total financed amount
//   and total monthly rent. Six laptops of 2,000 € are a 12,000 € exposure, so the questions
//   for bigger deals apply to them even though each laptop alone is small.
// - Each item must still fit a coefficient band on its own (quoteLease checks that), so the
//   band limits are not applied again to the total.
import type { AssetCategory } from '@/data/schemas';
import type { LeaseQuote } from './pricing';
import type { QuestionFlowContext } from './question-flow';

export const MIN_FLEET_ITEMS = 2;
export const MAX_FLEET_ITEMS = 20;

export type FleetCheck =
  { ok: true } | { ok: false; reason: 'too_few' | 'too_many' | 'duplicate' | 'mixed_categories' };

export function checkFleet(items: readonly { id: string; category: AssetCategory }[]): FleetCheck {
  if (items.length < MIN_FLEET_ITEMS) return { ok: false, reason: 'too_few' };
  if (items.length > MAX_FLEET_ITEMS) return { ok: false, reason: 'too_many' };
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    return { ok: false, reason: 'duplicate' };
  }
  if (new Set(items.map((item) => item.category)).size > 1) {
    return { ok: false, reason: 'mixed_categories' };
  }
  return { ok: true };
}

export type FleetTotals = {
  count: number;
  listPriceCents: number;
  financedCents: number;
  monthlyNetCents: number;
  monthlyVatCents: number;
  monthlyGrossCents: number;
  /** Every rent over the term, incl. VAT at today's rate. */
  totalGrossCents: number;
};

/** The sums of the items' own quotes (each rounded on its own, so the sums are exact). */
export function fleetTotals(quotes: readonly LeaseQuote[]): FleetTotals {
  const sum = (pick: (quote: LeaseQuote) => number) =>
    quotes.reduce((cents, quote) => cents + pick(quote), 0);
  return {
    count: quotes.length,
    listPriceCents: sum((q) => q.listPriceCents),
    financedCents: sum((q) => q.financedCents),
    monthlyNetCents: sum((q) => q.monthlyNetCents),
    monthlyVatCents: sum((q) => q.monthlyVatCents),
    monthlyGrossCents: sum((q) => q.monthlyGrossCents),
    totalGrossCents: sum((q) => q.totalGrossRentCents),
  };
}

/** The question engine's view of the whole fleet as one deal. */
export function fleetQuestionContext(input: {
  category: AssetCategory;
  termMonths: number;
  quotes: readonly LeaseQuote[];
  todayIso: string;
}): QuestionFlowContext {
  const totals = fleetTotals(input.quotes);
  return {
    category: input.category,
    financedAmountCents: totals.financedCents,
    termMonths: input.termMonths,
    monthlyRentInclVatCents: totals.monthlyGrossCents,
    todayIso: input.todayIso,
    // Each item is checked against the bands by quoteLease; the total may exceed one band.
    minFinancedCents: 0,
    maxFinancedCents: Number.MAX_SAFE_INTEGER,
  };
}

/** A fleet is for businesses: a private person leases items one at a time. */
export function isBusinessApplicant(answers: Record<string, string>): boolean {
  return answers.q_customer_type === 'company' || answers.q_customer_type === 'sole_trader';
}
