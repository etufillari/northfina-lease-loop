import { randomUUID } from 'node:crypto';
import type { Application as ApplicationRow } from '@/generated/prisma/client';
import { loadQuestions } from '@/data/load';
import { applicationStatusSchema, centsSchema, isoDateSchema } from '@/data/schemas';
import {
  evaluateApplication,
  type ApplicationAnswer,
  type ApplicationEvaluation,
  type ApplicationDecision,
  type EligibilityReason,
  type QuestionFlowResult,
  type ApplicationAnswers,
} from '@/domain/applications/question-flow';
import { createQuoteWithAsset, type CreateQuoteFailure, type QuoteRequest } from '../quotes/quotes';
import { getCustomer } from '../assets/customers';
import { withAudit } from '../audit';
import type { PrismaClient } from '../prisma-client';
import { z } from 'zod';

const applicationAnswerSchema: z.ZodType<ApplicationAnswer> = z.union([
  z.string(),
  z.number(),
  z.array(z.string()),
]);

const emailQuestionIds = new Set(['q_email', 'q_signatory_email']);
const applicationAnswersSchema = z
  .record(z.string(), applicationAnswerSchema)
  .default({})
  .superRefine((answers, ctx) => {
    for (const questionId of emailQuestionIds) {
      const answer = answers[questionId];
      if (answer === undefined) continue;
      const result = z.email().safeParse(answer);
      if (!result.success) {
        ctx.addIssue({ code: 'custom', path: [questionId], message: 'Invalid email address' });
      }
    }
  });

const applicationRequestFields = {
  assetId: z.string().min(1),
  date: isoDateSchema,
  downPaymentCents: centsSchema,
  termMonths: z.number().int().positive(),
  answers: applicationAnswersSchema,
};

export const applicationPreviewRequestSchema = z.strictObject(applicationRequestFields);

export const applicationSubmissionRequestSchema = z.strictObject({
  ...applicationRequestFields,
  customerId: z.string().min(1),
  actor: z.string().trim().min(1).max(100),
});

export type ApplicationPreviewRequest = z.infer<typeof applicationPreviewRequestSchema>;
export type ApplicationSubmissionRequest = z.infer<typeof applicationSubmissionRequestSchema>;

export type ApplicationPreviewData = {
  quote: Extract<Awaited<ReturnType<typeof createQuoteWithAsset>>, { ok: true }>['quote'];
  application: Omit<ApplicationEvaluation, 'questionFlow'> & QuestionFlowResult;
};

export type ApplicationPreviewResult =
  { ok: true; preview: ApplicationPreviewData } | CreateQuoteFailure;

export type ApplicationSubmissionFailure =
  | CreateQuoteFailure
  | { ok: false; reason: 'customer_not_found' }
  | { ok: false; reason: 'customer_type_mismatch'; customerType: string; answerType: string }
  | { ok: false; reason: 'incomplete'; missingQuestionIds: string[] };

export type SubmittedApplication = {
  id: string;
  customerId: string;
  assetId: string;
  decision: ApplicationDecision;
  requestedTermMonths: number;
  downPaymentCents: number;
  startDate: string;
  answers: ApplicationAnswers;
  reasons: EligibilityReason[];
  decisionAt: string;
  pricingSnapshot: Extract<Awaited<ReturnType<typeof createQuoteWithAsset>>, { ok: true }>['quote'];
};

export type ApplicationSubmissionResult =
  { ok: true; application: SubmittedApplication } | ApplicationSubmissionFailure;

/** Recalculates a quote and evaluates the current application answers without persisting anything. */
export async function createApplicationPreview(
  db: PrismaClient,
  input: ApplicationPreviewRequest
): Promise<ApplicationPreviewResult> {
  const quoteResult = await createQuoteWithAsset(db, input satisfies QuoteRequest);
  if (!quoteResult.ok) return quoteResult;

  const questions = await loadQuestions();
  const evaluation = evaluateApplication(questions, {
    category: quoteResult.asset.category,
    financedAmountCents: quoteResult.quote.pricing.financedCents,
    termMonths: quoteResult.quote.pricing.termMonths,
    startDate: input.date,
    monthlyGrossRentCents: quoteResult.quote.vatPreview.monthlyGrossRentCents,
    answers: input.answers,
  });
  const { questionFlow, ...eligibility } = evaluation;

  return {
    ok: true,
    preview: {
      quote: quoteResult.quote,
      application: { ...eligibility, ...questionFlow },
    },
  };
}

function toSubmittedApplication(row: ApplicationRow): SubmittedApplication {
  const decision = applicationStatusSchema.parse(row.status);
  if (decision === 'pending') {
    throw new Error(`Application ${row.id} is still pending`);
  }
  const decisionAt = row.decision_at?.toISOString();
  if (!decisionAt || row.pricing_snapshot_json === null) {
    throw new Error(`Application ${row.id} is missing its submission snapshot`);
  }

  return {
    id: row.id,
    customerId: row.customer_id,
    assetId: row.asset_id,
    decision,
    requestedTermMonths: row.requested_term_months,
    downPaymentCents: row.down_payment_cents,
    startDate: row.start_date,
    answers: JSON.parse(row.answers_json) as ApplicationAnswers,
    reasons: JSON.parse(row.decision_reasons_json ?? '[]') as EligibilityReason[],
    decisionAt,
    pricingSnapshot: JSON.parse(
      row.pricing_snapshot_json
    ) as SubmittedApplication['pricingSnapshot'],
  };
}

/** Recalculates and persists a complete application with its quote and decision snapshots. */
export async function createApplication(
  db: PrismaClient,
  input: ApplicationSubmissionRequest
): Promise<ApplicationSubmissionResult> {
  const customer = await getCustomer(db, input.customerId);
  if (!customer) return { ok: false, reason: 'customer_not_found' };

  const answerType = input.answers.q_customer_type;
  if (typeof answerType === 'string' && answerType !== customer.type) {
    return {
      ok: false,
      reason: 'customer_type_mismatch',
      customerType: customer.type,
      answerType,
    };
  }

  const preview = await createApplicationPreview(db, input);
  if (!preview.ok) return preview;
  if (preview.preview.application.decision === 'incomplete') {
    return {
      ok: false,
      reason: 'incomplete',
      missingQuestionIds: preview.preview.application.missingQuestionIds,
    };
  }

  const { quote, application } = preview.preview;
  const decisionAt = new Date();
  const applicationId = randomUUID();
  const pricing = quote.pricing;

  const row = await withAudit(
    db,
    {
      actor: input.actor,
      action: 'application.submitted',
      entityType: 'application',
      entityId: applicationId,
      details: {
        customerId: input.customerId,
        assetId: input.assetId,
        decision: application.decision,
      },
    },
    (tx) =>
      tx.application.create({
        data: {
          id: applicationId,
          customer_id: input.customerId,
          asset_id: input.assetId,
          status: application.decision,
          requested_term_months: pricing.termMonths,
          down_payment_cents: pricing.downPaymentCents,
          start_date: input.date,
          answers_json: JSON.stringify(application.retainedAnswers),
          decision_reasons_json: JSON.stringify(application.reasons),
          decision_at: decisionAt,
          quote_date: quote.vatPreview.invoiceDate,
          price_list_version: quote.sources.priceListVersion,
          list_price_cents: pricing.netListPriceCents,
          financed_amount_cents: pricing.financedCents,
          coefficient_band: pricing.coefficientBand,
          coefficient_factor_ppm: Math.round(pricing.monthlyFactor * 1_000_000),
          annual_interest_basis_points: pricing.annualInterestBasisPoints,
          monthly_net_rent_cents: pricing.monthlyNetRentCents,
          buyout_cents: pricing.endOfTermBuyoutCents,
          pricing_snapshot_json: JSON.stringify(quote),
        },
      })
  );

  return { ok: true, application: toSubmittedApplication(row) };
}
