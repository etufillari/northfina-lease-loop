// The scenario harness's data and the one path from a customer and an asset to a decision.
//
// The data pack is imported as JSON and checked against the same schemas `src/data/load.ts`
// uses (fixtures.test.ts proves it is the same pack the loaders return), so the scenario tests
// stay synchronous and this module stays pure: no file read, no clock. Nothing here knows a
// scenario card; the card files pin the numbers.
import assetsJson from '../../../data/assets.json';
import co2FactorsJson from '../../../data/co2-factors.json';
import coefficientTableJson from '../../../data/coefficient-table.json';
import consumerLimitsJson from '../../../data/consumer-limits.json';
import customersJson from '../../../data/customers.json';
import priceListsJson from '../../../data/price-lists.json';
import questionsJson from '../../../data/questions.json';
import refurbishmentCostsJson from '../../../data/refurbishment-costs.json';
import residualCurvesJson from '../../../data/residual-curves.json';
import secondLifeDemandJson from '../../../data/second-life-demand.json';
import termLimitsJson from '../../../data/term-limits.json';
import vatRatesJson from '../../../data/vat-rates.json';
import {
  assetsFileSchema,
  co2FactorsSchema,
  coefficientTableSchema,
  consumerLimitsSchema,
  customersFileSchema,
  priceListsFileSchema,
  questionsFileSchema,
  refurbishmentCostsSchema,
  residualCurvesSchema,
  secondLifeDemandFileSchema,
  termLimitsSchema,
  vatRatesSchema,
  type Asset,
  type Customer,
} from '@/data/schemas';
import { priceQuote, type PricingData, type QuoteResult } from '../pricing';
import {
  assessReturn,
  firstLeaseListPriceCents,
  type AssessData,
  type AssessInput,
  type ReturnAssessmentResult,
} from '../second-life/assess';
import {
  answerProblem,
  answersFromCustomer,
  eligibilityInputFromAnswers,
  grossFromNetCents,
  type AnswerProblem,
} from '../question-flow/answers';
import { evaluate, type EligibilityResult } from '../question-flow/eligibility';
import { recordMismatches } from '../question-flow/record-check';
import {
  nextQuestion,
  pruneAnswers,
  visibleQuestions,
  type Answer,
  type FlowContext,
} from '../question-flow/engine';

export const pack = {
  assets: assetsFileSchema.parse(assetsJson),
  priceLists: priceListsFileSchema.parse(priceListsJson),
  table: coefficientTableSchema.parse(coefficientTableJson),
  vatRates: vatRatesSchema.parse(vatRatesJson),
  questions: questionsFileSchema.parse(questionsJson),
  customers: customersFileSchema.parse(customersJson),
  demand: secondLifeDemandFileSchema.parse(secondLifeDemandJson),
  co2Factors: co2FactorsSchema.parse(co2FactorsJson),
  consumerLimits: consumerLimitsSchema.parse(consumerLimitsJson),
  /** The team's longest term per category (D43), beside the organiser's pack. */
  termLimits: termLimitsSchema.parse(termLimitsJson),
};

export const pricing: PricingData = {
  priceLists: pack.priceLists,
  table: pack.table,
  vatRates: pack.vatRates,
  termLimits: pack.termLimits,
  assets: pack.assets,
};

/** The coefficient table's lowest and highest financed amount, as the application uses them. */
export const financedLimits = {
  minCents: Math.min(...pack.table.bands.map((b) => b.min_financed_cents)),
  maxCents: Math.max(...pack.table.bands.map((b) => b.max_financed_cents)),
};

function byId<T extends { id: string }>(rows: readonly T[], id: string, what: string): T {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`no ${what} ${id} in the data pack`);
  return row;
}

export const assetById = (id: string): Asset => byId(pack.assets, id, 'asset');

/** The second-life data: the pack's curves and refurbishment costs, and the pricing above. */
export const secondLifeData: AssessData = {
  curves: residualCurvesSchema.parse(residualCurvesJson),
  costs: refurbishmentCostsSchema.parse(refurbishmentCostsJson),
  pricing,
};

/**
 * Assesses a data-pack item on `isoDate` the way `assessAsset` does for an item that is not
 * ours from new (D11, D60): its model-year age, at least one past life, and the earliest list
 * price that has it. `over` replaces what the pack records (a drill's other condition or usage).
 */
export function assessPackItem(
  assetId: string,
  isoDate: string,
  over: Partial<Pick<AssessInput, 'condition' | 'usage'>> = {},
  data: AssessData = secondLifeData
): ReturnAssessmentResult {
  const asset = assetById(assetId);
  const newPriceCents = firstLeaseListPriceCents(data.pricing.priceLists, assetId);
  if (newPriceCents === null) throw new Error(`no list price for ${assetId}`);
  return assessReturn(
    {
      assetId,
      category: asset.category,
      condition: over.condition ?? asset.condition,
      usage: over.usage ?? asset.usage,
      age: {
        modelYear: asset.model_year,
        previousLives: Math.max(1, asset.previous_lives),
        leaseStart: isoDate,
      },
      newPriceCents,
      isoDate,
    },
    data
  );
}
export const customerById = (id: string): Customer => byId(pack.customers, id, 'customer');

export type Deal = {
  assetId: string;
  termMonths: number;
  downPaymentCents?: number;
  /** The quote day, which the application also uses as the start date. */
  isoDate: string;
};

/** Prices a deal the way the quote route does (`priceQuote` on the request's day). */
export function quoteFor(deal: Deal): QuoteResult {
  return priceQuote(pricing, {
    assetId: deal.assetId,
    termMonths: deal.termMonths,
    downPaymentCents: deal.downPaymentCents ?? 0,
    isoDate: deal.isoDate,
  });
}

export type Application =
  | { ok: false; step: 'quote'; quote: QuoteResult }
  | { ok: false; step: 'invalid'; questionId: string; problem: AnswerProblem }
  | { ok: false; step: 'incomplete'; questionId: string }
  | {
      ok: true;
      context: FlowContext;
      askedIds: string[];
      answers: Record<string, Answer>;
      result: EligibilityResult;
    };

/**
 * A data-pack customer applies for a deal, by the steps `createApplication` takes: the quote,
 * the flow context, the customer's answers pruned to the visible questions, every answer
 * checked on the day (D37, D39), every visible question answered, the answers compared with
 * the customer record (D38), then the eligibility rules on the quote's gross rent.
 * `startDate` is the quote day unless given; the answers are checked on that day too.
 */
export function applyFor(
  customer: Customer,
  deal: Deal,
  options: { startDate?: string; answers?: Record<string, Answer> } = {}
): Application {
  const quote = quoteFor(deal);
  if (!quote.ok) return { ok: false, step: 'quote', quote };
  const { questions, eligibility_rules: rules } = pack.questions;
  const context: FlowContext = {
    customerType: customer.type,
    category: assetById(deal.assetId).category,
    financedCents: quote.quote.financedCents,
    termMonths: deal.termMonths,
  };
  const answers = pruneAnswers(questions, context, {
    ...answersFromCustomer(customer),
    ...options.answers,
  });
  const today = options.startDate ?? deal.isoDate;
  for (const question of questions) {
    const answer = answers[question.id];
    const problem =
      answer === undefined
        ? null
        : answerProblem(question, answer, { today, answers, applicantEmail: customer.email });
    if (problem) return { ok: false, step: 'invalid', questionId: question.id, problem };
  }
  const missing = nextQuestion(questions, context, answers);
  if (missing) return { ok: false, step: 'incomplete', questionId: missing.id };
  const result = evaluate(
    rules,
    eligibilityInputFromAnswers({
      context,
      answers,
      startDate: today,
      grossMonthlyRentCents: grossFromNetCents(
        quote.quote.monthlyNetCents,
        quote.quote.vatRateBasisPoints
      ),
      financedLimits,
      recordMismatches: recordMismatches(customer, answers),
      quantity: quote.quote.quantity,
      consumerLimits: pack.consumerLimits,
    })
  );
  return {
    ok: true,
    context,
    askedIds: visibleQuestions(questions, context, answers).map((q) => q.id),
    answers,
    result,
  };
}
