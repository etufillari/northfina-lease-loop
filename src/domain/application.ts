// Spine step 3: the lease application. Joins the price quote (pricing.ts) to the question
// engine (question-flow.ts), so the questions and the decision depend on the real deal.
import type { AssetCategory, CoefficientTable, Question } from '@/data/schemas';
import type { LeaseQuote } from './pricing';
import {
  evaluateEligibility,
  pruneIrrelevantAnswers,
  type EligibilityEvaluation,
  type QuestionFlowContext,
} from './question-flow';

/** The question engine's view of a deal: what is leased, how much is financed, and when. */
export function questionContext(input: {
  category: AssetCategory;
  quote: LeaseQuote;
  todayIso: string;
  table: CoefficientTable;
}): QuestionFlowContext {
  const { category, quote, todayIso, table } = input;
  return {
    category,
    financedAmountCents: quote.financedCents,
    termMonths: quote.termMonths,
    monthlyRentInclVatCents: quote.monthlyGrossCents,
    todayIso,
    minFinancedCents: Math.min(...table.bands.map((b) => b.min_financed_cents)),
    maxFinancedCents: Math.max(...table.bands.map((b) => b.max_financed_cents)),
  };
}

export type ApplicationDecision = {
  /** Only the answers to questions that still apply. Stale answers are dropped, not judged. */
  answers: Record<string, string>;
  evaluation: EligibilityEvaluation;
};

/**
 * Decides an application: first drop answers that no longer apply (the customer went back
 * and changed an earlier answer), then evaluate the eligibility rules on what is left.
 * The browser and the server both call this, so the customer sees the same decision live
 * that the server records.
 */
export function decideApplication(
  questions: readonly Question[],
  answers: Record<string, string>,
  context: QuestionFlowContext
): ApplicationDecision {
  const kept = pruneIrrelevantAnswers(questions, answers, context);
  return { answers: kept, evaluation: evaluateEligibility(questions, kept, context) };
}
