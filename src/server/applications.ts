// Submitting a lease application. The browser sends only what the customer chose (item, term,
// down payment) and their answers. Everything that matters is recalculated here from the data
// pack: the price, which questions apply, and the decision. A tampered request can't change
// the price or approve itself.
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@/generated/prisma/client';
import { loadCoefficientTable, loadPriceLists, loadQuestions, loadVatRates } from '@/data/load';
import { decideApplication, questionContext } from '@/domain/application';
import { listPriceOn } from '@/domain/price-list';
import { quoteLease, type LeaseQuote } from '@/domain/pricing';
import type { EligibilityRuleId, EligibilityStatus } from '@/domain/question-flow';
import { vatPercentOn } from '@/domain/vat';
import { getAsset } from './assets';
import { withAudit } from './audit';

export type SubmitApplicationInput = {
  assetId: string;
  termMonths: number;
  downPaymentCents: number;
  answers: Record<string, string>;
  /** The data pack customer applying, or null for a guest (see viewer.ts). */
  customerId?: string | null;
};

export type ApplicationDecisionStatus = Exclude<EligibilityStatus, 'incomplete'>;

export type SubmittedApplication = {
  id: string;
  assetId: string;
  decision: ApplicationDecisionStatus;
  reasons: EligibilityRuleId[];
  quote: LeaseQuote;
  priceListVersion: number;
  quoteDate: string;
};

export type SubmitApplicationResult =
  | { ok: true; application: SubmittedApplication }
  | {
      ok: false;
      reason: 'asset_not_found' | 'asset_not_available' | 'cannot_quote' | 'incomplete';
    };

/** Who the audit log says did it: the applicant's or company's name when given. */
function actorFrom(answers: Record<string, string>): string {
  const name = answers.q_full_name?.trim() || answers.q_company_name?.trim();
  return name ? name.slice(0, 100) : 'applicant';
}

/**
 * Prices the deal on `todayIso`, decides the application, and stores it together with an
 * `application.submitted` audit row in one transaction.
 */
export async function submitApplication(
  db: PrismaClient,
  input: SubmitApplicationInput,
  todayIso: string
): Promise<SubmitApplicationResult> {
  const [asset, priceLists, table, vatRates, questionsFile] = await Promise.all([
    getAsset(db, input.assetId),
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
    loadQuestions(),
  ]);
  if (!asset) return { ok: false, reason: 'asset_not_found' };
  if (asset.status !== 'available') return { ok: false, reason: 'asset_not_available' };

  const price = listPriceOn(priceLists, asset.id, todayIso);
  const vatPercent = vatPercentOn(vatRates, todayIso);
  if (!price.ok || vatPercent === null) return { ok: false, reason: 'cannot_quote' };

  const quoted = quoteLease(
    {
      listPriceCents: price.priceCents,
      downPaymentCents: input.downPaymentCents,
      termMonths: input.termMonths,
      vatPercent,
    },
    table
  );
  if (!quoted.ok) return { ok: false, reason: 'cannot_quote' };
  const quote = quoted.quote;

  const context = questionContext({ category: asset.category, quote, todayIso, table });
  const { answers, evaluation } = decideApplication(
    questionsFile.questions,
    input.answers,
    context
  );
  if (evaluation.status === 'incomplete') return { ok: false, reason: 'incomplete' };

  const decision = evaluation.status;
  const reasons = evaluation.reasons.map((reason) => reason.ruleId);

  const id = randomUUID();
  await withAudit(
    db,
    {
      actor: actorFrom(answers),
      action: 'application.submitted',
      entityType: 'application',
      entityId: id,
      details: {
        assetId: asset.id,
        decision,
        reasons,
        termMonths: quote.termMonths,
        downPaymentCents: quote.downPaymentCents,
        monthlyGrossCents: quote.monthlyGrossCents,
        priceListVersion: price.priceListVersion,
      },
    },
    (tx) =>
      tx.application.create({
        data: {
          id,
          quote_date: todayIso,
          asset_id: asset.id,
          customer_id: input.customerId ?? null,
          customer_type: answers.q_customer_type ?? 'unknown',
          applicant_name: answers.q_full_name?.trim() || answers.q_company_name?.trim() || null,
          term_months: quote.termMonths,
          down_payment_cents: quote.downPaymentCents,
          list_price_cents: quote.listPriceCents,
          price_list_version: price.priceListVersion,
          financed_cents: quote.financedCents,
          monthly_net_cents: quote.monthlyNetCents,
          vat_basis_points: Math.round(quote.vatPercent * 100),
          monthly_gross_cents: quote.monthlyGrossCents,
          decision,
          reasons_json: JSON.stringify(reasons),
          answers_json: JSON.stringify(answers),
        },
      })
  );

  return {
    ok: true,
    application: {
      id,
      assetId: asset.id,
      decision,
      reasons,
      quote,
      priceListVersion: price.priceListVersion,
      quoteDate: todayIso,
    },
  };
}

export type StoredApplication = {
  id: string;
  createdAt: string;
  quoteDate: string;
  assetId: string;
  customerId: string | null;
  customerType: string;
  applicantName: string | null;
  termMonths: number;
  downPaymentCents: number;
  listPriceCents: number;
  priceListVersion: number;
  financedCents: number;
  monthlyNetCents: number;
  monthlyGrossCents: number;
  vatPercent: number;
  decision: ApplicationDecisionStatus;
  reasons: EligibilityRuleId[];
  answers: Record<string, string>;
};

/** One stored application by id, or `null`. */
export async function getApplication(
  db: PrismaClient,
  id: string
): Promise<StoredApplication | null> {
  const row = await db.application.findUnique({ where: { id } });
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at.toISOString(),
    quoteDate: row.quote_date,
    assetId: row.asset_id,
    customerId: row.customer_id,
    customerType: row.customer_type,
    applicantName: row.applicant_name,
    termMonths: row.term_months,
    downPaymentCents: row.down_payment_cents,
    listPriceCents: row.list_price_cents,
    priceListVersion: row.price_list_version,
    financedCents: row.financed_cents,
    monthlyNetCents: row.monthly_net_cents,
    monthlyGrossCents: row.monthly_gross_cents,
    vatPercent: row.vat_basis_points / 100,
    decision: row.decision as ApplicationDecisionStatus,
    reasons: JSON.parse(row.reasons_json) as EligibilityRuleId[],
    answers: JSON.parse(row.answers_json) as Record<string, string>,
  };
}
