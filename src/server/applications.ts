// The application lifecycle: start (persists the quote), answer questions one by one,
// submit for a decision. All rules live in src/domain; this file loads, stores and audits.
import { loadQuestions, loadVatRates } from '@/data/load';
import type { Question } from '@/data/schemas';
import { validateFinnishBusinessId } from '@/domain/business-id';
import { addMonthsClamped } from '@/domain/calendar';
import { holdUntil as holdUntilFor } from '@/domain/holds';
import { MAX_START_MONTHS_AHEAD } from '@/domain/contract';
import { evaluateEligibility, type CustomerType } from '@/domain/eligibility';
import {
  firstBlockedAnswer,
  nextQuestion,
  pruneAnswers,
  visibleQuestions,
  type Answers,
  type AnswerValue,
  type DealContext,
} from '@/domain/question-flow';
import { grossCents, vatRateOn } from '@/domain/vat';
import { loadCoefficientTable } from '@/data/load';
import type { PrismaClient } from '@/generated/prisma/client';
import { withAudit } from '@/server/audit';
import { buildLiveQuote, quoteAssetIds, quoteRowData } from '@/server/quotes';

export type ApplicationState = {
  application: {
    id: string;
    status: string;
    customerId: string;
    answers: Answers;
    decisionReasons: unknown;
    signatoryEmail: string | null;
    holdUntil: string | null;
    /** The lease start date chosen at submission; null while still a draft. */
    startDate: string | null;
    isTransfer: boolean;
  };
  quote: {
    id: string;
    assetIds: string[];
    quoteDate: string;
    priceListVersion: number;
    listPriceCents: number;
    downPaymentCents: number;
    termMonths: number;
    financedCents: number;
    band: string;
    monthlyNetRentCents: number;
    netTotalCents: number;
    buyoutNetCents: number;
    /** Make and model per asset, for the running summary next to the questions. */
    assets: Array<{ id: string; make: string; model: string }>;
  };
  /** The questions that apply right now, in order, ready for the UI. */
  visibleQuestions: Array<Pick<Question, 'id' | 'type' | 'text' | 'why_we_ask' | 'options'>>;
  nextQuestionId: string | null;
  /** Saved defaults for visible, unanswered questions — prefill the customer confirms. */
  prefill: Record<string, AnswerValue>;
  /** A blocking answer found while answering (age uses the as-of date provisionally). */
  blocked: { questionId: string; rule: string; eligibleFrom?: string } | null;
};

type Db = PrismaClient;

async function loadRows(db: Db, applicationId: string) {
  const application = await db.application.findUnique({
    where: { id: applicationId },
    include: { quote: true },
  });
  if (!application) return null;
  const asset = await db.asset.findUnique({ where: { id: application.quote.asset_id } });
  if (!asset) return null;
  return { application, quote: application.quote, asset };
}

function dealOf(rows: NonNullable<Awaited<ReturnType<typeof loadRows>>>): DealContext {
  return {
    category: rows.asset.category as DealContext['category'],
    financedAmountCents: rows.quote.financed_cents,
    termMonths: rows.quote.term_months,
  };
}

type CustomerRow = NonNullable<Awaited<ReturnType<Db['customer']['findUnique']>>>;

/**
 * What the profile can answer for a returning customer — shown as prefill the customer
 * CONFIRMS, never silently submitted (docs/DECISIONS.md). The sensitive answer about income
 * may be stale, which is exactly why confirming it is a separate step in the UI.
 */
function profilePrefill(customer: CustomerRow): Record<string, AnswerValue> {
  const yesNo = (value: boolean | null) => (value === null ? undefined : value ? 'yes' : 'no');
  const candidates: Record<string, AnswerValue | null | undefined> = {
    q_customer_type: customer.type,
    q_full_name: customer.name,
    q_birth_date: customer.birth_date,
    q_email: customer.email === '' ? undefined : customer.email,
    q_country: customer.country,
    q_employment: customer.employment,
    q_monthly_income: customer.monthly_net_income_cents,
    q_business_id: customer.business_id,
    q_company_name: customer.type === 'company' ? customer.name : undefined,
    q_vat_registered: yesNo(customer.vat_registered),
    q_can_sign: yesNo(customer.applicant_can_sign),
    q_pep: yesNo(customer.is_pep),
    q_annual_revenue: customer.annual_revenue_cents,
    q_beneficial_owners: customer.beneficial_owners_json
      ? (JSON.parse(customer.beneficial_owners_json) as string[])
      : undefined,
  };
  return Object.fromEntries(
    Object.entries(candidates).filter(([, value]) => value !== null && value !== undefined)
  ) as Record<string, AnswerValue>;
}

async function buildState(
  db: Db,
  rows: NonNullable<Awaited<ReturnType<typeof loadRows>>>,
  asOf: string
): Promise<ApplicationState> {
  const { questions } = await loadQuestions();
  const deal = dealOf(rows);
  const answers = JSON.parse(rows.application.answers_json) as Answers;
  const visible = visibleQuestions(questions, deal, answers);

  const customer = await db.customer.findUnique({ where: { id: rows.application.customer_id } });
  const defaults: Record<string, AnswerValue> = {
    ...(customer ? profilePrefill(customer) : {}),
    // Saved answers win over the profile: they are what the customer chose to keep.
    ...(customer?.saved_defaults_json
      ? (JSON.parse(customer.saved_defaults_json) as Record<string, AnswerValue>)
      : {}),
  };
  const prefill = Object.fromEntries(
    visible
      .filter((q) => answers[q.id] === undefined && defaults[q.id] !== undefined)
      .map((q) => [q.id, defaults[q.id]!])
  );

  return {
    application: {
      id: rows.application.id,
      status: rows.application.status,
      customerId: rows.application.customer_id,
      answers,
      decisionReasons: rows.application.decision_reasons_json
        ? JSON.parse(rows.application.decision_reasons_json)
        : null,
      signatoryEmail: rows.application.signatory_email,
      holdUntil: rows.application.hold_until,
      startDate: rows.application.start_date,
      isTransfer: rows.application.transfer_contract_id !== null,
    },
    quote: {
      id: rows.quote.id,
      assetIds: quoteAssetIds(rows.quote),
      assets: (
        await db.asset.findMany({
          where: { id: { in: quoteAssetIds(rows.quote) } },
          select: { id: true, make: true, model: true },
          orderBy: { id: 'asc' },
        })
      ).map((a) => ({ id: a.id, make: a.make, model: a.model })),
      quoteDate: rows.quote.quote_date,
      priceListVersion: rows.quote.price_list_version,
      listPriceCents: rows.quote.list_price_cents,
      downPaymentCents: rows.quote.down_payment_cents,
      termMonths: rows.quote.term_months,
      financedCents: rows.quote.financed_cents,
      band: rows.quote.band,
      monthlyNetRentCents: rows.quote.monthly_net_rent_cents,
      netTotalCents: rows.quote.net_total_cents,
      buyoutNetCents: rows.quote.buyout_net_cents,
    },
    visibleQuestions: visible.map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      why_we_ask: q.why_we_ask,
      options: q.options,
    })),
    nextQuestionId: nextQuestion(questions, deal, answers)?.id ?? null,
    prefill,
    blocked: firstBlockedAnswer(questions, deal, answers, asOf),
  };
}

export async function getApplicationState(db: Db, applicationId: string, asOf: string) {
  const rows = await loadRows(db, applicationId);
  if (!rows) return null;
  return buildState(db, rows, asOf);
}

export type StartResult = { ok: true; state: ApplicationState } | { ok: false; reason: string };

/**
 * Creates the Quote row and a draft Application in one audited transaction. A fleet is a
 * group of distinct assets of the SAME category (a mixed group would make the category-
 * driven questions ambiguous), priced as one banded total.
 */
export async function startApplication(
  db: Db,
  input: {
    assetIds: string[];
    downPaymentCents: number;
    termMonths: number;
    customerId: string;
    actor: string;
    asOf: string;
  }
): Promise<StartResult> {
  if (new Set(input.assetIds).size !== input.assetIds.length) {
    return { ok: false, reason: 'duplicate_assets' };
  }
  const assets = await db.asset.findMany({ where: { id: { in: input.assetIds } } });
  if (assets.length !== input.assetIds.length) return { ok: false, reason: 'unknown_asset' };
  // A `returned` item is in maintenance until the second-life desk clears it.
  if (assets.some((a) => a.status === 'leased' || a.status === 'sold' || a.status === 'returned')) {
    return { ok: false, reason: 'asset_unavailable' };
  }
  // A reserved item is open only to the customer it is held for: a waiting-list offer or an
  // end-of-term nomination names them on the Reservation.
  const reserved = assets.filter((a) => a.status === 'reserved').map((a) => a.id);
  if (reserved.length > 0) {
    const holds = await db.reservation.findMany({
      where: {
        asset_id: { in: reserved },
        active: true,
        customer_id: input.customerId,
        kind: { in: ['waitlist_offer', 'nomination'] },
      },
    });
    if (reserved.some((id) => !holds.some((hold) => hold.asset_id === id))) {
      return { ok: false, reason: 'asset_unavailable' };
    }
  }
  if (new Set(assets.map((a) => a.category)).size > 1) {
    return { ok: false, reason: 'mixed_categories' };
  }
  const live = await buildLiveQuote({
    ...input,
    secondLifePricesCents: Object.fromEntries(
      assets
        .filter((a) => a.second_life_price_cents !== null)
        .map((a) => [a.id, a.second_life_price_cents!])
    ),
  });
  if (!live.ok) return { ok: false, reason: live.reason };

  const applicationId = crypto.randomUUID();
  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'application.started',
      entityType: 'application',
      entityId: applicationId,
      details: { assetIds: input.assetIds, termMonths: input.termMonths },
    },
    async (tx) => {
      const quote = await tx.quote.create({ data: quoteRowData(live.live, input.customerId) });
      await tx.application.create({
        data: { id: applicationId, quote_id: quote.id, customer_id: input.customerId },
      });
    }
  );
  const rows = await loadRows(db, applicationId);
  return { ok: true, state: await buildState(db, rows!, input.asOf) };
}

export type AnswerResult =
  | { ok: true; state: ApplicationState; warning?: string }
  | { ok: false; reason: 'not_found' | 'not_a_draft' | 'question_not_applicable' };

/** Stores one answer and drops any answers whose questions stop applying because of it. */
export async function answerQuestion(
  db: Db,
  input: {
    applicationId: string;
    questionId: string;
    answer: AnswerValue;
    actor: string;
    asOf: string;
  }
): Promise<AnswerResult> {
  const rows = await loadRows(db, input.applicationId);
  if (!rows) return { ok: false, reason: 'not_found' };
  if (rows.application.status !== 'draft') return { ok: false, reason: 'not_a_draft' };

  const { questions } = await loadQuestions();
  const deal = dealOf(rows);
  const answers = JSON.parse(rows.application.answers_json) as Answers;
  const question = visibleQuestions(questions, deal, answers).find(
    (q) => q.id === input.questionId
  );
  if (!question) return { ok: false, reason: 'question_not_applicable' };

  // The field hint of card "broken business ID": warn as typed, decline only at submission.
  let warning: string | undefined;
  if (question.validation?.format === 'finnish_business_id') {
    const check = validateFinnishBusinessId(String(input.answer));
    if (!check.ok) warning = check.reason;
  }

  const pruned = pruneAnswers(questions, deal, { ...answers, [input.questionId]: input.answer });
  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'application.answered',
      entityType: 'application',
      entityId: input.applicationId,
      details: { questionId: input.questionId },
    },
    (tx) =>
      tx.application.update({
        where: { id: input.applicationId },
        data: { answers_json: JSON.stringify(pruned) },
      })
  );
  const fresh = await loadRows(db, input.applicationId);
  return { ok: true, state: await buildState(db, fresh!, input.asOf), warning };
}

export type SubmitResult =
  | { ok: true; state: ApplicationState }
  | {
      ok: false;
      reason: 'not_found' | 'not_a_draft' | 'incomplete' | 'no_vat_rate_on_date' | 'bad_start_date';
    };

/**
 * The decision: evaluate the six eligibility rules against the answers, reserve the asset
 * for 7 days unless declined, and route "applicant cannot sign" to the signatory.
 */
export async function submitApplication(
  db: Db,
  input: { applicationId: string; startDate: string; actor: string; asOf: string }
): Promise<SubmitResult> {
  const rows = await loadRows(db, input.applicationId);
  if (!rows) return { ok: false, reason: 'not_found' };
  if (rows.application.status !== 'draft') return { ok: false, reason: 'not_a_draft' };
  // Not in the past and at most 3 months out — the same window signing enforces later.
  if (
    input.startDate < input.asOf ||
    input.startDate > addMonthsClamped(input.asOf, MAX_START_MONTHS_AHEAD)
  ) {
    return { ok: false, reason: 'bad_start_date' };
  }

  const [{ questions }, vatRates, table] = await Promise.all([
    loadQuestions(),
    loadVatRates(),
    loadCoefficientTable(),
  ]);
  const deal = dealOf(rows);
  const answers = JSON.parse(rows.application.answers_json) as Answers;
  if (nextQuestion(questions, deal, answers) !== null) return { ok: false, reason: 'incomplete' };

  const vat = vatRateOn(vatRates, input.asOf);
  if (!vat.ok) return { ok: false, reason: vat.reason };

  const str = (id: string) => (answers[id] === undefined ? null : String(answers[id]));
  const income =
    typeof answers['q_monthly_income'] === 'number' ? answers['q_monthly_income'] : null;
  const decision = evaluateEligibility({
    customerType: (str('q_customer_type') ?? 'consumer') as CustomerType,
    birthDate: str('q_birth_date'),
    country: str('q_country'),
    businessId: str('q_business_id'),
    monthlyNetIncomeCents: income,
    pepAnswer: str('q_pep') as 'yes' | 'no' | null,
    startDate: input.startDate,
    financedCents: rows.quote.financed_cents,
    termMonths: rows.quote.term_months,
    monthlyRentWithVatCents: grossCents(rows.quote.monthly_net_rent_cents, vat.rateBasisPoints),
    table,
  });

  const cannotSign = str('q_customer_type') === 'company' && str('q_can_sign') === 'no';
  const status =
    decision.decision === 'declined'
      ? 'declined'
      : decision.decision === 'manual_review'
        ? 'manual_review'
        : cannotSign
          ? 'awaiting_signature'
          : 'approved';
  const holdUntil =
    status === 'declined'
      ? null
      : holdUntilFor(status === 'awaiting_signature' ? 'signatory' : 'approval', input.asOf);

  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'application.submitted',
      entityType: 'application',
      entityId: input.applicationId,
      details: { status, decision: decision.decision },
    },
    async (tx) => {
      await tx.application.update({
        where: { id: input.applicationId },
        data: {
          status,
          decision_reasons_json: JSON.stringify(decision.reasons),
          hold_until: holdUntil,
          start_date: input.startDate,
          signatory_email: str('q_signatory_email'),
        },
      });
      if (status !== 'declined') {
        for (const assetId of quoteAssetIds(rows.quote)) {
          await tx.asset.update({ where: { id: assetId }, data: { status: 'reserved' } });
          await tx.reservation.create({
            data: {
              asset_id: assetId,
              customer_id: rows.application.customer_id,
              kind: status === 'awaiting_signature' ? 'awaiting_signatory' : 'approval_hold',
              until: holdUntil!,
            },
          });
        }
      }
    }
  );
  const fresh = await loadRows(db, input.applicationId);
  return { ok: true, state: await buildState(db, fresh!, input.asOf) };
}

export type CancelResult =
  | { ok: true; state: ApplicationState }
  | { ok: false; reason: 'not_found' | 'not_yours' | 'not_cancellable' };

/** Statuses a customer may still walk away from: nothing is signed yet. */
const CANCELLABLE = ['approved', 'manual_review', 'awaiting_signature'];

/**
 * The customer cancels their own application before signing: the holds are released and the
 * items go straight back to available — the lease never started, so no life is added.
 */
export async function cancelApplication(
  db: Db,
  input: { applicationId: string; actor: string; asOf: string }
): Promise<CancelResult> {
  const rows = await loadRows(db, input.applicationId);
  if (!rows) return { ok: false, reason: 'not_found' };
  if (input.actor !== rows.application.customer_id) return { ok: false, reason: 'not_yours' };
  if (!CANCELLABLE.includes(rows.application.status)) {
    return { ok: false, reason: 'not_cancellable' };
  }

  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'application.cancelled',
      entityType: 'application',
      entityId: input.applicationId,
      details: { from: rows.application.status, assetIds: quoteAssetIds(rows.quote) },
    },
    async (tx) => {
      await tx.application.update({
        where: { id: input.applicationId },
        data: { status: 'cancelled', hold_until: null },
      });
      for (const assetId of quoteAssetIds(rows.quote)) {
        await tx.reservation.updateMany({
          where: {
            asset_id: assetId,
            customer_id: rows.application.customer_id,
            active: true,
            kind: { notIn: ['waitlist_offer'] },
          },
          data: { active: false },
        });
        // Only release the item if nobody else still holds it (a waiting-list offer keeps
        // holding it until it lapses and passes on).
        const otherHolds = await tx.reservation.count({
          where: { asset_id: assetId, active: true },
        });
        const asset = await tx.asset.findUnique({ where: { id: assetId } });
        if (otherHolds === 0 && asset?.status === 'reserved') {
          await tx.asset.update({ where: { id: assetId }, data: { status: 'available' } });
        }
      }
    }
  );
  const fresh = await loadRows(db, input.applicationId);
  return { ok: true, state: await buildState(db, fresh!, input.asOf) };
}
