import { loadCoefficientTable, loadQuestions, loadVatRates } from '@/data/load';
import { evaluateEligibility } from '@/domain/eligibility';
import { taxOn } from '@/domain/vat';
import { ApiError } from './api-response';
import { withAudit } from './audit';
import { requireCustomer, type DemoContext } from './demo-context';
import type { PrismaClient } from './prisma-client';
import { rethrowDatabaseConflict, requestHash, requireSameRequest } from './request-integrity';
import { readAssetOffer } from './spine-offers';
import { ownedQuote, requireValidQuote } from './spine-quotes';
import type { ApplicationInput } from './spine-shapes';
import { priceTermsSchema } from './spine-shapes';
import { requireNoPendingSignature } from './spine-signature-state';
import { applicationView } from './spine-views';

export async function submitApplication(
  db: PrismaClient,
  context: DemoContext,
  input: ApplicationInput
) {
  requireCustomer(context);
  const fingerprint = requestHash({
    customerId: context.customer.id,
    quoteId: input.quoteId,
    answers: input.answers,
  });
  const existing = await db.application.findUnique({ where: { id: input.requestId } });
  if (existing) {
    requireSameRequest(existing.request_hash, fingerprint);
    return applicationView(existing);
  }
  const quote = await ownedQuote(db, context, input.quoteId);
  requireValidQuote(quote, context.businessDate);
  const terms = priceTermsSchema.parse(JSON.parse(quote.terms_json));
  const [item, table, questions, vatRates] = await Promise.all([
    readAssetOffer(db, quote.asset_id, context.businessDate),
    loadCoefficientTable(),
    loadQuestions(),
    loadVatRates(),
  ]);
  const rent = taxOn(terms.monthlyNetCents, quote.start_date, vatRates);
  if (!rent.ok)
    throw new ApiError(422, 'VAT_UNAVAILABLE', 'A VAT rate is missing for the lease start date');
  const decision = evaluateEligibility({
    customer: context.customer,
    answers: input.answers,
    questions: questions.questions,
    category: item.asset.category,
    financedCents: terms.financedCents,
    termMonths: terms.termMonths,
    monthlyGrossCents: rent.amount.grossCents,
    startDate: quote.start_date,
    table,
  });
  try {
    const application = await withAudit(
      db,
      {
        actor: context.actor,
        action: 'application.submitted',
        entityType: 'application',
        entityId: input.requestId,
        details: { quoteId: quote.id, decision: decision.status },
      },
      async (tx) => {
        await requireNoPendingSignature(tx, quote.id);
        return tx.application.create({
          data: {
            id: input.requestId,
            quote_id: quote.id,
            customer_id: context.customer.id,
            submitted_on: context.businessDate,
            request_hash: fingerprint,
            answers_json: JSON.stringify(decision.answers),
            decision: decision.status,
            reasons_json: JSON.stringify({
              reasons: decision.reasons,
              missingQuestionIds: decision.missingQuestionIds,
              invalidQuestionIds: decision.invalidQuestionIds,
            }),
          },
        });
      }
    );
    return applicationView(application);
  } catch (error) {
    const committed = await db.application.findUnique({ where: { id: input.requestId } });
    if (committed) {
      requireSameRequest(committed.request_hash, fingerprint);
      return applicationView(committed);
    }
    rethrowDatabaseConflict(error);
  }
}
