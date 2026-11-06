import { loadQuestions } from '@/data/load';
import { centsSchema, isoDateSchema } from '@/data/schemas';
import {
  evaluateApplication,
  type ApplicationAnswer,
  type ApplicationEvaluation,
  type QuestionFlowResult,
} from '@/domain/question-flow';
import { createQuoteWithAsset, type CreateQuoteFailure, type QuoteRequest } from './quotes';
import type { PrismaClient } from './prisma-client';
import { z } from 'zod';

const applicationAnswerSchema: z.ZodType<ApplicationAnswer> = z.union([
  z.string(),
  z.number(),
  z.array(z.string()),
]);

export const applicationPreviewRequestSchema = z.strictObject({
  assetId: z.string().min(1),
  date: isoDateSchema,
  downPaymentCents: centsSchema,
  termMonths: z.number().int().positive(),
  answers: z.record(z.string(), applicationAnswerSchema).default({}),
});

export type ApplicationPreviewRequest = z.infer<typeof applicationPreviewRequestSchema>;

export type ApplicationPreviewData = {
  quote: Extract<Awaited<ReturnType<typeof createQuoteWithAsset>>, { ok: true }>['quote'];
  application: Omit<ApplicationEvaluation, 'questionFlow'> & QuestionFlowResult;
};

export type ApplicationPreviewResult =
  { ok: true; preview: ApplicationPreviewData } | CreateQuoteFailure;

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
