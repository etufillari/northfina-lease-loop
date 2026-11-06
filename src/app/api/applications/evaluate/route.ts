// POST /api/applications/evaluate
// body: { deal: { category, financed_amount_cents, term_months },
//         answers: { q_customer_type: "consumer", ... },
//         contract_start_date?: "2026-11-05", monthly_rent_incl_vat_cents?: 13466 }
//
// Stateless: nothing is stored. Answers the questions that apply, the answers that were dropped
// because an earlier answer changed, and the decision with its reasons. Send the whole
// form state every time; the response tells the client what to show next.
import { z } from 'zod';
import { assetCategorySchema, centsSchema, isoDateSchema } from '@/data/schemas';
import { decideEligibility } from '@/domain/eligibility';
import { pruneAnswers, visibleQuestions } from '@/domain/question-flow';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { readCoefficientTable, readQuestions } from '@/server/reference-read';
import { todayIso } from '@/server/today';

const bodySchema = z.strictObject({
  deal: z.strictObject({
    category: assetCategorySchema,
    financed_amount_cents: centsSchema,
    term_months: z.number().int().positive(),
  }),
  answers: z.record(z.string(), z.union([z.string(), z.number()])),
  contract_start_date: isoDateSchema.optional(),
  monthly_rent_incl_vat_cents: centsSchema.optional(),
});

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  const [{ questions }, coefficientTable] = await Promise.all([
    readQuestions(db),
    readCoefficientTable(db),
  ]);

  // The customer type is the answer to the first question, never a separate field,
  // so the two cannot disagree.
  const customerType = body.answers['q_customer_type'];
  const deal = {
    ...body.deal,
    ...(typeof customerType === 'string' ? { customer_type: customerType } : {}),
  };

  const { kept, dropped } = pruneAnswers(questions, { deal, answers: body.answers });
  const decision = decideEligibility({
    questions,
    coefficientTable,
    deal,
    answers: kept,
    contractStartDate: body.contract_start_date ?? todayIso(),
    monthlyRentInclVatCents: body.monthly_rent_incl_vat_cents,
  });

  return ok({
    questions: visibleQuestions(questions, { deal, answers: kept }),
    answers: kept,
    dropped,
    decision,
  });
});
