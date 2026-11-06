// Applications: price the deal on the server, check the answers, decide and save.
// Nothing here trusts the client for a price or a date. The quote and the start date are
// worked out again on the server's own date (see app-date.ts), whatever the screen showed.
import { randomUUID } from 'node:crypto';
import { applicationSchema, type Answers, type Application } from '@/data/lease-schemas';
import { loadCustomers, loadQuestions } from '@/data/load';
import { assetCategorySchema, type Customer, type Question } from '@/data/schemas';
import { eligibleFrom } from '@/domain/application/age';
import { applicantBirthDate, decide, minimumAge } from '@/domain/application/eligibility';
import {
  blockingAnswer,
  invalidAnswers,
  questionsToAsk,
  type AnswerError,
  type BlockingAnswer,
  type Deal,
} from '@/domain/application/question-flow';
import type { Application as ApplicationRow, PrismaClient } from '@/generated/prisma/client';
import { currentDate } from '../date/app-date';
import { withAudit } from '../audit';
import { quoteAsset, type AssetQuote, type QuoteAssetFailureReason } from '../pricing/quotes';

/** Answered by the server from the logged-in customer, so the form never shows it. */
const CUSTOMER_TYPE_QUESTION = 'q_customer_type';

export type ApplicationRequest = {
  customer: Customer;
  assetId: string;
  quantity: number;
  termMonths: number;
  downPaymentCents: number;
  answers: Answers;
};

/** Problems with the request itself. Nothing is saved for these. */
export type RequestFailureReason = Exclude<
  QuoteAssetFailureReason,
  'below_minimum' | 'above_maximum'
>;

export type Blocked = { reason: 'min_age' | 'residency'; eligible_from: string | null };

type Prepared = {
  /** The server's date: it is both the quote date and the planned start date. */
  date: string;
  quote: AssetQuote | null;
  baseCents: number;
  priceListVersion: number | null;
  financedCents: number;
  /** The whole question bank, which holds the age and country limits. */
  questionBank: Question[];
  /** Questions the customer sees. */
  questions: Question[];
  unanswered: string[];
  /** The answers that still count, including the server's own customer type. */
  answers: Answers;
  dropped: string[];
  invalid: AnswerError[];
  blocked: Blocked | null;
};

function toBlocked(block: BlockingAnswer | null, answers: Answers): Blocked | null {
  if (block === null) return null;
  if (block.rule === 'age_under') {
    const birthDate = answers[block.question_id];
    return {
      reason: 'min_age',
      eligible_from: typeof birthDate === 'string' ? eligibleFrom(birthDate, block.min_age) : null,
    };
  }
  // The only `answer_in` rule in the data is the country question.
  return { reason: 'residency', eligible_from: null };
}

async function prepare(
  db: PrismaClient,
  request: ApplicationRequest
): Promise<({ ok: true } & Prepared) | { ok: false; reason: RequestFailureReason }> {
  const { customer, assetId, quantity, termMonths, downPaymentCents } = request;
  const date = await currentDate(db);

  const priced = await quoteAsset(db, {
    assetId,
    date,
    termMonths,
    downPaymentCents,
    quantity,
  });

  let quote: AssetQuote | null = null;
  let baseCents: number;
  let priceListVersion: number | null;
  if (priced.ok) {
    quote = priced.quote;
    baseCents = quote.base_price_cents;
    priceListVersion = quote.price_list_version;
  } else if (priced.reason === 'below_minimum' || priced.reason === 'above_maximum') {
    if (priced.base_price_cents === undefined || priced.price_list_version === undefined) {
      throw new Error('a pricing failure must carry the price it was based on');
    }
    baseCents = priced.base_price_cents;
    priceListVersion = priced.price_list_version;
  } else {
    return { ok: false, reason: priced.reason };
  }
  const financedCents = baseCents - downPaymentCents;

  const asset = await db.asset.findUniqueOrThrow({
    where: { id: assetId },
    select: { category: true },
  });
  const deal: Deal = {
    customer_type: customer.type,
    category: assetCategorySchema.parse(asset.category),
    financed_amount_cents: financedCents,
    term_months: termMonths,
  };

  const { questions: allQuestions } = await loadQuestions();
  const flow = questionsToAsk(allQuestions, deal, {
    ...request.answers,
    [CUSTOMER_TYPE_QUESTION]: customer.type,
  });
  const visible = (list: readonly Question[]) =>
    list.filter((question) => question.id !== CUSTOMER_TYPE_QUESTION);

  return {
    ok: true,
    date,
    quote,
    baseCents,
    priceListVersion,
    financedCents,
    questionBank: allQuestions,
    questions: visible(flow.questions),
    unanswered: visible(flow.unanswered).map((question) => question.id),
    answers: flow.answers,
    dropped: flow.dropped,
    invalid: invalidAnswers(flow.questions, flow.answers),
    blocked: toBlocked(blockingAnswer(flow.questions, flow.answers, date), flow.answers),
  };
}

export type QuestionsResult =
  | {
      ok: true;
      questions: Question[];
      unanswered: string[];
      dropped: string[];
      invalid: AnswerError[];
      blocked: Blocked | null;
    }
  | { ok: false; reason: RequestFailureReason };

/** The questions for this customer and deal, given the answers so far. Saves nothing. */
export async function describeQuestions(
  db: PrismaClient,
  request: ApplicationRequest
): Promise<QuestionsResult> {
  const prepared = await prepare(db, request);
  if (!prepared.ok) return prepared;
  const { questions, unanswered, dropped, invalid, blocked } = prepared;
  return { ok: true, questions, unanswered, dropped, invalid, blocked };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export function toApplication(row: ApplicationRow): Application {
  return applicationSchema.parse({
    id: row.id,
    customer_id: row.customer_id,
    asset_id: row.asset_id,
    quantity: row.quantity,
    quote_date: row.quote_date,
    start_on: row.start_on,
    price_list_version: row.price_list_version,
    base_price_cents: row.base_price_cents,
    down_payment_cents: row.down_payment_cents,
    financed_cents: row.financed_cents,
    term_months: row.term_months,
    answers: JSON.parse(row.answers_json),
    decision: row.decision,
    reasons: JSON.parse(row.reasons_json),
    reviewed_by: row.reviewed_by,
    reviewed_on: row.reviewed_on,
  });
}

/**
 * An application as the screens see it. When a too-young applicant can try again is derived,
 * and `contract_id` says whether it has been signed, so a screen knows not to offer signing.
 */
export type ApplicationView = Application & {
  eligible_from: string | null;
  contract_id: string | null;
};

export function toView(
  application: Application,
  customer: Customer | undefined,
  minAge: number,
  contractId: string | null
): ApplicationView {
  const birthDate = customer ? applicantBirthDate(customer, application.answers) : null;
  const tooYoung = application.reasons.includes('min_age') && birthDate !== null;
  return {
    ...application,
    eligible_from: tooYoung ? eligibleFrom(birthDate, minAge) : null,
    contract_id: contractId,
  };
}

export async function viewsOf(
  db: PrismaClient,
  applications: readonly Application[]
): Promise<ApplicationView[]> {
  const [customers, { questions }, contracts] = await Promise.all([
    loadCustomers(),
    loadQuestions(),
    db.contract.findMany({
      where: { application_id: { in: applications.map((application) => application.id) } },
      select: { id: true, application_id: true },
    }),
  ]);
  const minAge = minimumAge(questions);
  const contractIds = new Map(contracts.map((c) => [c.application_id, c.id]));

  return applications.map((application) =>
    toView(
      application,
      customers.find((customer) => customer.id === application.customer_id),
      minAge,
      contractIds.get(application.id) ?? null
    )
  );
}

export async function getApplication(db: PrismaClient, id: string): Promise<Application | null> {
  const row = await db.application.findUnique({ where: { id } });
  return row ? toApplication(row) : null;
}

export async function listApplications(
  db: PrismaClient,
  filter: { decision?: Application['decision']; customerId?: string } = {}
): Promise<Application[]> {
  const rows = await db.application.findMany({
    where: { decision: filter.decision, customer_id: filter.customerId },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
  });
  return rows.map(toApplication);
}

// ---------------------------------------------------------------------------
// Submitting
// ---------------------------------------------------------------------------

export type SubmitResult =
  | { ok: true; application: ApplicationView }
  | { ok: false; reason: RequestFailureReason }
  | { ok: false; reason: 'answers_invalid'; errors: AnswerError[] }
  | { ok: false; reason: 'answers_missing'; question_ids: string[] };

/**
 * Prices the deal on the server's date, checks the answers, decides and saves. Every
 * answer must be given, unless an answer already stops the application or the amount
 * cannot be financed: those are rejected without making the customer fill in the rest.
 * A request that is not really an application (unknown asset, no price, bad term) is
 * not saved. A deal outside the financing limits is, as a rejection.
 */
export async function submitApplication(
  db: PrismaClient,
  request: ApplicationRequest
): Promise<SubmitResult> {
  const prepared = await prepare(db, request);
  if (!prepared.ok) return prepared;

  if (prepared.invalid.length > 0) {
    return { ok: false, reason: 'answers_invalid', errors: prepared.invalid };
  }
  const stoppedEarly = prepared.blocked !== null || prepared.quote === null;
  if (!stoppedEarly && prepared.unanswered.length > 0) {
    return { ok: false, reason: 'answers_missing', question_ids: prepared.unanswered };
  }

  const verdict = decide({
    questions: prepared.questionBank,
    customer: request.customer,
    answers: prepared.answers,
    startOn: prepared.date,
    monthlyRentWithVatCents: prepared.quote?.monthly_total_cents ?? null,
  });

  const id = `app-${randomUUID()}`;
  const row = await withAudit(
    db,
    {
      actor: request.customer.id,
      action: 'application.submitted',
      entityType: 'application',
      entityId: id,
      details: {
        asset_id: request.assetId,
        quantity: request.quantity,
        term_months: request.termMonths,
        decision: verdict.decision,
        reasons: verdict.reasons,
      },
    },
    (tx) =>
      tx.application.create({
        data: {
          id,
          customer_id: request.customer.id,
          asset_id: request.assetId,
          quantity: request.quantity,
          quote_date: prepared.date,
          start_on: prepared.date,
          price_list_version: prepared.priceListVersion,
          base_price_cents: prepared.baseCents,
          down_payment_cents: request.downPaymentCents,
          financed_cents: prepared.financedCents,
          term_months: request.termMonths,
          answers_json: JSON.stringify(prepared.answers),
          decision: verdict.decision,
          reasons_json: JSON.stringify(verdict.reasons),
        },
      })
  );

  const application = toApplication(row);
  const minAge = minimumAge(prepared.questionBank);
  return { ok: true, application: toView(application, request.customer, minAge, null) };
}

// ---------------------------------------------------------------------------
// Manual review
// ---------------------------------------------------------------------------

export type ReviewResult =
  { ok: true; application: Application } | { ok: false; reason: 'not_found' | 'not_in_review' };

class NotInReview extends Error {}

/** Settles an application waiting for a person. Only `manual_review` can be settled, once. */
export async function reviewApplication(
  db: PrismaClient,
  input: { id: string; decision: 'approved' | 'rejected'; actor: string }
): Promise<ReviewResult> {
  const { id, decision, actor } = input;
  if (!(await db.application.findUnique({ where: { id }, select: { id: true } }))) {
    return { ok: false, reason: 'not_found' };
  }
  const reviewedOn = await currentDate(db);

  try {
    await withAudit(
      db,
      {
        actor,
        action: 'application.reviewed',
        entityType: 'application',
        entityId: id,
        details: { from: 'manual_review', to: decision },
      },
      async (tx) => {
        // The condition is in the update itself, so two reviewers cannot both settle it.
        const changed = await tx.application.updateMany({
          where: { id, decision: 'manual_review' },
          data: { decision, reviewed_by: actor, reviewed_on: reviewedOn },
        });
        if (changed.count === 0) throw new NotInReview();
      }
    );
  } catch (error) {
    if (error instanceof NotInReview) return { ok: false, reason: 'not_in_review' };
    throw error;
  }

  const row = await db.application.findUniqueOrThrow({ where: { id } });
  return { ok: true, application: toApplication(row) };
}
