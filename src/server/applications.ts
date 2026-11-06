// Submitting a lease application. The browser sends only what the customer chose (item, term,
// down payment) and their answers. Everything that matters is recalculated here from the data
// pack: the price, which questions apply, and the decision. A tampered request can't change
// the price or approve itself.
import { randomUUID } from 'node:crypto';
import type { Asset } from '@/data/schemas';
import type { PrismaClient } from '@/generated/prisma/client';
import { loadCoefficientTable, loadQuestions } from '@/data/load';
import { effectivePriceLists } from './second-life';
import { effectiveVatRates } from './vat';
import { decideApplication, questionContext } from '@/domain/application';
import { listPriceOn } from '@/domain/price-list';
import { quoteLease, type LeaseQuote } from '@/domain/pricing';
import type { EligibilityRuleId, EligibilityStatus } from '@/domain/question-flow';
import { vatPercentOn } from '@/domain/vat';
import { canBeLeasedBy } from '@/domain/availability';
import { assetOn } from './asset-state';
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
export function actorFrom(answers: Record<string, string>): string {
  const name = answers.q_full_name?.trim() || answers.q_company_name?.trim();
  return name ? name.slice(0, 100) : 'applicant';
}

/** What pricing needs on a date: price lists, coefficients and VAT. Loaded once per request. */
export type PricingData = {
  priceLists: Awaited<ReturnType<typeof effectivePriceLists>>;
  table: Awaited<ReturnType<typeof loadCoefficientTable>>;
  vatRates: Awaited<ReturnType<typeof effectiveVatRates>>;
};

export async function pricingData(db: PrismaClient, todayIso: string): Promise<PricingData> {
  const [priceLists, table, vatRates] = await Promise.all([
    effectivePriceLists(db, todayIso),
    loadCoefficientTable(),
    effectiveVatRates(db),
  ]);
  return { priceLists, table, vatRates };
}

export type PricedItem =
  | { ok: true; asset: Asset; quote: LeaseQuote; priceListVersion: number }
  | { ok: false; reason: 'asset_not_found' | 'asset_not_available' | 'cannot_quote' };

/**
 * Prices one item for this customer on `todayIso`, if they can lease it: it exists, is free
 * (or held for them), has no later history (time travel) and fits a band.
 */
export async function priceItem(
  db: PrismaClient,
  data: PricingData,
  input: {
    assetId: string;
    termMonths: number;
    downPaymentCents: number;
    customerId: string | null;
  },
  todayIso: string
): Promise<PricedItem> {
  const item = await assetOn(db, input.assetId, todayIso);
  if (!item) return { ok: false, reason: 'asset_not_found' };
  const asset = item.asset;
  const leasable =
    !item.laterHistory &&
    canBeLeasedBy({ status: asset.status, reservedFor: item.reservedFor }, input.customerId);
  if (!leasable) return { ok: false, reason: 'asset_not_available' };

  const price = listPriceOn(data.priceLists, asset.id, todayIso);
  const vatPercent = vatPercentOn(data.vatRates, todayIso);
  if (!price.ok || vatPercent === null) return { ok: false, reason: 'cannot_quote' };
  const quoted = quoteLease(
    {
      listPriceCents: price.priceCents,
      downPaymentCents: input.downPaymentCents,
      termMonths: input.termMonths,
      vatPercent,
    },
    data.table
  );
  if (!quoted.ok) return { ok: false, reason: 'cannot_quote' };
  return { ok: true, asset, quote: quoted.quote, priceListVersion: price.priceListVersion };
}

/** The database row of a decided application. */
export function applicationRow(input: {
  id: string;
  todayIso: string;
  assetId: string;
  customerId: string | null;
  answers: Record<string, string>;
  quote: LeaseQuote;
  priceListVersion: number;
  decision: ApplicationDecisionStatus;
  reasons: EligibilityRuleId[];
  fleetId?: string;
}) {
  const { quote, answers } = input;
  return {
    id: input.id,
    quote_date: input.todayIso,
    asset_id: input.assetId,
    customer_id: input.customerId,
    customer_type: answers.q_customer_type ?? 'unknown',
    applicant_name: answers.q_full_name?.trim() || answers.q_company_name?.trim() || null,
    term_months: quote.termMonths,
    down_payment_cents: quote.downPaymentCents,
    list_price_cents: quote.listPriceCents,
    price_list_version: input.priceListVersion,
    financed_cents: quote.financedCents,
    monthly_net_cents: quote.monthlyNetCents,
    vat_basis_points: Math.round(quote.vatPercent * 100),
    monthly_gross_cents: quote.monthlyGrossCents,
    decision: input.decision,
    reasons_json: JSON.stringify(input.reasons),
    answers_json: JSON.stringify(answers),
    fleet_id: input.fleetId ?? null,
  };
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
  const [data, questionsFile] = await Promise.all([pricingData(db, todayIso), loadQuestions()]);
  const customerId = input.customerId ?? null;
  const priced = await priceItem(db, data, { ...input, customerId }, todayIso);
  if (!priced.ok) return priced;
  const { asset, quote, priceListVersion } = priced;

  const context = questionContext({
    category: asset.category,
    quote,
    todayIso,
    table: data.table,
  });
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
        priceListVersion,
      },
    },
    (tx) =>
      tx.application.create({
        data: applicationRow({
          id,
          todayIso,
          assetId: asset.id,
          customerId,
          answers,
          quote,
          priceListVersion,
          decision,
          reasons,
        }),
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
      priceListVersion,
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
  /** Set when it was applied for as part of a fleet. */
  fleetId: string | null;
  /** Set when the company's signatory declined to sign it (see src/domain/signature.ts). */
  signatureDeclined: { date: string; by: string | null; note: string | null } | null;
};

type ApplicationRow = NonNullable<Awaited<ReturnType<PrismaClient['application']['findUnique']>>>;

/** One stored application by id, or `null`. */
export async function getApplication(
  db: PrismaClient,
  id: string
): Promise<StoredApplication | null> {
  const row = await db.application.findUnique({ where: { id } });
  return row ? toStoredApplication(row) : null;
}

/** The applications of one fleet, in item id order. */
export async function listFleetApplications(
  db: PrismaClient,
  fleetId: string
): Promise<StoredApplication[]> {
  const rows = await db.application.findMany({
    where: { fleet_id: fleetId },
    orderBy: { asset_id: 'asc' },
  });
  return rows.map(toStoredApplication);
}

export function toStoredApplication(row: ApplicationRow): StoredApplication {
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
    fleetId: row.fleet_id,
    signatureDeclined: row.signature_declined_date
      ? {
          date: row.signature_declined_date,
          by: row.signature_declined_by,
          note: row.signature_decline_note,
        }
      : null,
  };
}
