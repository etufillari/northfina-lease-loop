import { loadCoefficientTable, loadQuestions, loadVatRates } from '@/data/load';
import { evaluateEligibility } from '@/domain/eligibility';
import { termEndDate } from '@/domain/invoicing';
import { taxOn } from '@/domain/vat';
import { toAsset } from './assets';
import { ApiError } from './api-response';
import { withAudit } from './audit';
import { requireCustomer, type DemoContext } from './demo-context';
import type { PrismaClient } from './prisma-client';
import { rethrowDatabaseConflict } from './request-integrity';
import { requireValidQuote } from './spine-quotes';
import { answersSchema, priceTermsSchema } from './spine-shapes';
import { getContract } from './spine-views';
import { requireStorableInvoice } from './spine-invoice-limits';
import { requireNoPendingSignature } from './spine-signature-state';
import { readValuationBaseline } from './valuation-baseline';

export async function signContract(db: PrismaClient, context: DemoContext, applicationId: string) {
  requireCustomer(context);
  const application = await db.application.findFirst({
    where: { id: applicationId, customer_id: context.customer.id },
    include: { quote: true },
  });
  if (!application)
    throw new ApiError(404, 'APPLICATION_NOT_FOUND', 'The application was not found');
  const quote = application.quote;
  const existing = await db.contract.findUnique({ where: { quote_id: quote.id } });
  if (existing) {
    if (existing.application_id !== applicationId) {
      throw new ApiError(
        409,
        'IDEMPOTENCY_CONFLICT',
        'This offer was signed from a different application'
      );
    }
    return getContract(db, context, existing.id);
  }
  if (application.decision !== 'approved') {
    throw new ApiError(
      409,
      'APPLICATION_NOT_APPROVED',
      'Only an approved application can be signed'
    );
  }
  requireValidQuote(quote, context.businessDate);
  const terms = priceTermsSchema.parse(JSON.parse(quote.terms_json));
  const [assetRow, table, questions, vatRates] = await Promise.all([
    db.asset.findUniqueOrThrow({ where: { id: quote.asset_id } }),
    loadCoefficientTable(),
    loadQuestions(),
    loadVatRates(),
  ]);
  const rent = taxOn(terms.monthlyNetCents, quote.start_date, vatRates);
  const down = taxOn(terms.downPaymentCents, context.businessDate, vatRates);
  if (!rent.ok || !down.ok) throw new ApiError(422, 'VAT_UNAVAILABLE', 'A VAT rate is missing');
  requireStorableInvoice(down.amount);
  const decision = evaluateEligibility({
    customer: context.customer,
    answers: answersSchema.parse(JSON.parse(application.answers_json)),
    questions: questions.questions,
    category: toAsset(assetRow).category,
    financedCents: terms.financedCents,
    termMonths: terms.termMonths,
    monthlyGrossCents: rent.amount.grossCents,
    startDate: quote.start_date,
    table,
  });
  if (decision.status !== 'approved') {
    throw new ApiError(409, 'ELIGIBILITY_CHANGED', 'Submit a fresh application before signing', {
      reasons: decision.reasons,
    });
  }

  try {
    await withAudit(
      db,
      {
        actor: context.actor,
        action: 'contract.signed',
        entityType: 'contract',
        entityId: quote.id,
        details: { assetId: quote.asset_id, quoteId: quote.id },
      },
      async (tx) => {
        await requireNoPendingSignature(tx, quote.id);
        const asset = await tx.asset.findUniqueOrThrow({ where: { id: quote.asset_id } });
        const release = await tx.assetRelease.findUnique({ where: { asset_id: asset.id } });
        if ((release?.revision ?? 0) !== quote.release_revision) {
          throw new ApiError(
            409,
            'STALE_QUOTE',
            'The item has entered another life; review a new offer'
          );
        }
        if (
          release?.reserved_for_customer_id &&
          release.reserved_for_customer_id !== context.customer.id
        ) {
          throw new ApiError(409, 'ASSET_RESERVED', 'The item is reserved for another customer');
        }
        const baseline = await readValuationBaseline(tx, asset.id, {
          startDate: quote.start_date,
          originalPriceCents: terms.listPriceCents,
        });
        // The conditional write and unique AssetLease key both protect exclusive allocation.
        const claimed = await tx.asset.updateMany({
          where: { id: asset.id, status: 'available' },
          data: {
            status: 'reserved',
            ...(baseline ? { valuation_baseline_json: JSON.stringify(baseline) } : {}),
          },
        });
        if (claimed.count !== 1)
          throw new ApiError(409, 'ASSET_UNAVAILABLE', 'This item is no longer available');
        await tx.contract.create({
          data: {
            id: quote.id,
            quote_id: quote.id,
            application_id: application.id,
            customer_id: context.customer.id,
            asset_id: asset.id,
            life_number: asset.previous_lives + 1,
            signed_on: context.businessDate,
            start_date: quote.start_date,
            end_date: termEndDate(quote.start_date, terms.termMonths),
            terms_json: quote.terms_json,
          },
        });
        await tx.assetLease.create({ data: { asset_id: asset.id, contract_id: quote.id } });
        if (terms.downPaymentCents > 0) {
          await tx.invoice.create({
            data: {
              id: `${quote.id}:down_payment:0`,
              contract_id: quote.id,
              kind: 'down_payment',
              period: 0,
              scheduled_for: context.businessDate,
              invoice_date: context.businessDate,
              due_date: context.businessDate,
              net_cents: down.amount.netCents,
              vat_basis_points: down.amount.vatBasisPoints,
              vat_cents: down.amount.vatCents,
              gross_cents: down.amount.grossCents,
            },
          });
        }
      }
    );
  } catch (error) {
    const committed = await db.contract.findUnique({ where: { quote_id: quote.id } });
    if (committed?.application_id === applicationId) return getContract(db, context, committed.id);
    rethrowDatabaseConflict(error);
  }
  return getContract(db, context, quote.id);
}
