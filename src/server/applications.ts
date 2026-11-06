// Applications: the customer's answers to the question flow for a quote, and what the rules
// decided (D9), plus the person's decision on a manual review (D10). The company signatory's
// sign-off goes through the signing link (src/server/signatories.ts, D46).
import { randomUUID } from 'node:crypto';
import type { Application as ApplicationRow } from '@/generated/prisma/client';
import { loadCoefficientTable, loadConsumerLimits, loadQuestions } from '@/data/load';
import { applicationDecisionSchema, type ApplicationDecision } from '@/domain/statuses';
import type { Customer } from '@/data/schemas';
import {
  answerProblem,
  eligibilityInputFromAnswers,
  grossFromNetCents,
  type AnswerProblem,
} from '@/domain/question-flow/answers';
import { evaluate } from '@/domain/question-flow/eligibility';
import { recordMismatches } from '@/domain/question-flow/record-check';
import { whoDecides } from '@/domain/question-flow/signatory';
import { withdrawalCheck, type WithdrawRefusal } from '@/domain/question-flow/withdraw';
import {
  answersSchema,
  applicationDecisionUpdateSchema,
  applicationRowSchema,
  applicationWithdrawalSchema,
  reasonsSchema,
} from '@/domain/rows/application';
import {
  nextQuestion,
  pruneAnswers,
  type Answer,
  type FlowContext,
} from '@/domain/question-flow/engine';
import type { AuthzRefusal } from '@/domain/authz/policy';
import { ADMIN_ACTOR } from './actor';
import { listAssets } from './assets';
import { withAudit, type TransactionClient } from './audit';
import { authorize } from './authorize';
import { contractIdOfApplication } from './contracts';
import { getCustomer } from './customers';
import type { PrismaClient } from './prisma-client';
import { parseRow, parseStoredJson } from './row-rules';
import { getQuote } from './quotes';
import { createSignatureRequest } from './signatories';

/** A reason as stored: the eligibility codes plus the two decision codes of D10. */
export type StoredReason = { code: string; params: Record<string, string | number> };

export type ApplicationView = {
  id: string;
  customerId: string;
  quoteId: string;
  answers: Record<string, Answer>;
  decision: ApplicationDecision;
  reasons: StoredReason[];
  decidedOn: string;
  reviewedBy: string | null;
  createdAt: string;
};

export function toApplicationView(row: ApplicationRow): ApplicationView {
  return {
    id: row.id,
    customerId: row.customer_id,
    quoteId: row.quote_id,
    answers: parseStoredJson('application.answers_json', answersSchema, row.answers_json),
    decision: applicationDecisionSchema.parse(row.decision),
    reasons: parseStoredJson('application.reasons_json', reasonsSchema, row.reasons_json),
    decidedOn: row.decided_on,
    reviewedBy: row.reviewed_by,
    createdAt: row.created_at.toISOString(),
  };
}

export type FlowSetup = {
  context: FlowContext;
  /** The quote's day: no application before it (review finding 10). */
  quoteDate: string;
  quoteValidUntil: string;
};

/**
 * The deal a quote and a customer make for the question flow. The quote is read through the
 * pricing slice's `getQuote`, never from its table (one owner per table, team rule 3).
 */
export async function flowSetupFor(
  db: PrismaClient,
  quoteId: string,
  customerId: string
): Promise<
  | {
      ok: true;
      setup: FlowSetup;
      quote: { monthlyNetCents: number; vatRateBp: number; quantity: number };
      customer: Customer;
      /** D90: the named next customer the quote is held for, or null for anyone. */
      reservedFor: string | null;
    }
  | { ok: false; reason: 'quote_not_found' | 'customer_not_found' }
> {
  const quote = await getQuote(db, quoteId);
  if (!quote) return { ok: false, reason: 'quote_not_found' };
  const customer = await getCustomer(db, customerId);
  if (!customer) return { ok: false, reason: 'customer_not_found' };
  const deal = quote.breakdown;
  const asset = (await listAssets(db)).find((a) => a.id === deal.assetId);
  if (!asset) return { ok: false, reason: 'quote_not_found' };
  return {
    ok: true,
    setup: {
      context: {
        customerType: customer.type,
        category: asset.category,
        financedCents: deal.financedCents,
        termMonths: deal.termMonths,
      },
      quoteDate: quote.quoteDate,
      quoteValidUntil: quote.validUntil,
    },
    quote: {
      monthlyNetCents: deal.monthlyNetCents,
      vatRateBp: deal.vatRateBasisPoints,
      quantity: deal.quantity,
    },
    customer,
    reservedFor: quote.customerId,
  };
}

export type CreateApplicationInput = {
  quoteId: string;
  customerId: string;
  answers: Record<string, Answer>;
  /** The request's day (`todayForRequest()`): the decision date and the contract start. */
  today: string;
  actor: string;
  /** The admin applies on a customer's behalf (D47): must equal `customerId`. */
  onBehalfOf?: string;
};

export type CreateApplicationResult =
  | { ok: true; application: ApplicationView }
  | {
      ok: false;
      reason:
        | 'quote_not_found'
        | 'customer_not_found'
        | 'quote_expired'
        | 'quote_not_yet_valid'
        | 'not_applicant'
        | 'quote_reserved_for_another_customer'
        | 'incomplete_answers'
        | 'invalid_answer'
        | 'quote_in_use';
      questionId?: string;
      /** `quote_in_use`: the pending or approved application that holds the quote. */
      applicationId?: string;
      /** Why the answer of `questionId` was refused, for the page to write. */
      problem?: AnswerProblem;
    }
  | { ok: false; reason: 'forbidden'; refusal: AuthzRefusal };

/**
 * D47, after `authorize` (D73) let the actor apply for the customer: the admin names whom it
 * acts for, a customer names nobody.
 */
function namesApplicant(input: CreateApplicationInput): boolean {
  if (input.actor === ADMIN_ACTOR) return input.onBehalfOf === input.customerId;
  return input.onBehalfOf === undefined;
}

/**
 * The decisions that hold a quote: one pending or approved application per quote. A rejected
 * one does not, so a rejected customer may change the answers and apply again.
 */
export const QUOTE_HOLDING_DECISIONS: readonly ApplicationDecision[] = [
  'manual_review',
  'awaiting_signatory',
  'approved',
];

/** Thrown inside the transaction when the quote is already held, so nothing is written. */
class QuoteInUse extends Error {
  constructor(readonly applicationId: string) {
    super('quote in use');
  }
}

/**
 * Only the customer who is acting applies, in their own name (D40): not another customer, not
 * anonymous; the admin only with `onBehalfOf` naming the customer, written into the audit
 * (D47). Then it prunes the answers to the questions that apply, checks that every one is answered and
 * valid on the day (D37, D39), compares them with the customer record (D38), evaluates the
 * eligibility rules and writes the application with its audit row, unless the quote is already
 * held by a pending or approved application (`quote_in_use`, checked inside the transaction).
 */
export async function createApplication(
  db: PrismaClient,
  input: CreateApplicationInput
): Promise<CreateApplicationResult> {
  const auth = await authorize(db, input.actor, 'apply', { customer: input.customerId });
  if (!auth.ok) {
    return auth.reason.code === 'not_found'
      ? { ok: false, reason: 'customer_not_found' }
      : { ok: false, reason: 'forbidden', refusal: auth.reason };
  }
  if (!namesApplicant(input)) return { ok: false, reason: 'not_applicant' };
  const found = await flowSetupFor(db, input.quoteId, input.customerId);
  if (!found.ok) return found;
  // D90: a pass-on's quote is held for the customer it named; nobody else may apply for it.
  if (found.reservedFor !== null && found.reservedFor !== input.customerId) {
    return { ok: false, reason: 'quote_reserved_for_another_customer' };
  }
  const { context, quoteDate, quoteValidUntil } = found.setup;
  if (quoteValidUntil < input.today) return { ok: false, reason: 'quote_expired' };
  if (input.today < quoteDate) return { ok: false, reason: 'quote_not_yet_valid' };

  const { questions, eligibility_rules: rules } = await loadQuestions();
  const answers = pruneAnswers(questions, context, input.answers);
  for (const question of questions) {
    const answer = answers[question.id];
    const problem =
      answer === undefined
        ? null
        : answerProblem(question, answer, {
            today: input.today,
            answers,
            applicantEmail: found.customer.email,
          });
    if (problem) return { ok: false, reason: 'invalid_answer', questionId: question.id, problem };
  }
  const missing = nextQuestion(questions, context, answers);
  if (missing) return { ok: false, reason: 'incomplete_answers', questionId: missing.id };

  const [table, consumerLimits] = await Promise.all([loadCoefficientTable(), loadConsumerLimits()]);
  const result = evaluate(
    rules,
    eligibilityInputFromAnswers({
      context,
      answers,
      startDate: input.today,
      grossMonthlyRentCents: grossFromNetCents(found.quote.monthlyNetCents, found.quote.vatRateBp),
      financedLimits: {
        minCents: Math.min(...table.bands.map((b) => b.min_financed_cents)),
        maxCents: Math.max(...table.bands.map((b) => b.max_financed_cents)),
      },
      recordMismatches: recordMismatches(found.customer, answers),
      quantity: found.quote.quantity,
      recordCountry: found.customer.country,
      consumerLimits,
    })
  );

  const id = randomUUID();
  const signatoryEmail = stringAnswer(answers.q_signatory_email);
  let row: ApplicationRow;
  try {
    row = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'application.created',
        entityType: 'application',
        entityId: id,
        details: {
          quoteId: input.quoteId,
          customerId: input.customerId,
          decision: result.decision,
          reasons: result.reasons,
          ...(input.onBehalfOf === undefined ? {} : { onBehalfOf: input.onBehalfOf }),
          ...(result.decision === 'awaiting_signatory' && signatoryEmail
            ? { signingLinkTo: signatoryEmail }
            : {}),
        },
      },
      async (tx) => {
        // Inside the transaction, so two applications at the same instant cannot both pass.
        const holder = await tx.application.findFirst({
          where: { quote_id: input.quoteId, decision: { in: [...QUOTE_HOLDING_DECISIONS] } },
          select: { id: true },
        });
        if (holder) throw new QuoteInUse(holder.id);
        const created = await tx.application.create({
          data: parseRow('application', applicationRowSchema, {
            id,
            customer_id: input.customerId,
            quote_id: input.quoteId,
            answers_json: JSON.stringify(answers),
            decision: result.decision,
            reasons_json: JSON.stringify(result.reasons),
            decided_on: input.today,
          }),
        });
        if (result.decision === 'awaiting_signatory' && signatoryEmail) {
          await createSignatureRequest(tx, {
            applicationId: id,
            customerId: input.customerId,
            email: signatoryEmail,
            today: input.today,
          });
        }
        return created;
      }
    );
  } catch (error) {
    if (error instanceof QuoteInUse) {
      return { ok: false, reason: 'quote_in_use', applicationId: error.applicationId };
    }
    throw error;
  }
  return { ok: true, application: toApplicationView(row) };
}

export async function getApplication(
  db: PrismaClient | TransactionClient,
  id: string
): Promise<ApplicationView | null> {
  const row = await db.application.findUnique({ where: { id } });
  return row ? toApplicationView(row) : null;
}

/** Whose application it is and whether it waits for the signatory, for `authorize` (D73). */
export async function applicationOwner(
  db: PrismaClient | TransactionClient,
  id: string
): Promise<{ customerId: string; awaitingSignatory: boolean } | null> {
  const row = await db.application.findUnique({
    where: { id },
    select: { customer_id: true, decision: true },
  });
  return row
    ? { customerId: row.customer_id, awaitingSignatory: row.decision === 'awaiting_signatory' }
    : null;
}

/**
 * The applications of one customer (`{ customerId }`) or, without it, every application
 * (admin), newest first. For the My leases page.
 */
export async function listApplications(
  db: PrismaClient,
  filter: { customerId?: string }
): Promise<ApplicationView[]> {
  const rows = await db.application.findMany({
    where: filter.customerId ? { customer_id: filter.customerId } : {},
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
  });
  return rows.map(toApplicationView);
}

export type DecideApplicationInput = {
  id: string;
  decision: 'approved' | 'rejected';
  /** Who decided: the reviewer (admin). */
  reviewedBy: string;
  today: string;
  actor: string;
};

const stringAnswer = (answer: Answer | undefined) =>
  typeof answer === 'string' ? answer : undefined;

/** Thrown inside the transaction when another request decided first, so nothing is written. */
class LostDecisionRace extends Error {}

export type DecideApplicationResult =
  | { ok: true; application: ApplicationView }
  | { ok: false; reason: 'not_found' | 'not_pending' }
  | { ok: false; reason: 'forbidden'; refusal: AuthzRefusal };

/**
 * D10. A manual review is decided by an admin; a manual review that also needs a signatory
 * becomes `awaiting_signatory` when approved, and the signing link is made in the same
 * transaction. Authorized first (D73): only the admin decides, and an `awaiting_signatory`
 * case is signed or declined only through that link (`decideByToken`, D39, D46): here it is
 * `signatory_required` for everyone, the company's account and the admin included. Any other
 * state is final. Two decisions at
 * the same instant: the first wins, the second answers `not_pending` and writes nothing.
 */
export async function decideApplication(
  db: PrismaClient,
  input: DecideApplicationInput
): Promise<DecideApplicationResult> {
  const auth = await authorize(db, input.actor, 'decide_application', { application: input.id });
  if (!auth.ok) {
    return auth.reason.code === 'not_found'
      ? { ok: false, reason: 'not_found' }
      : { ok: false, reason: 'forbidden', refusal: auth.reason };
  }
  const current = await getApplication(db, input.id);
  if (!current) return { ok: false, reason: 'not_found' };
  if (whoDecides(current.decision) !== 'admin') return { ok: false, reason: 'not_pending' };

  const reason: StoredReason = {
    code: 'reviewed',
    params: { by: input.reviewedBy, decision: input.decision, on: input.today },
  };
  const needsSignatory = current.reasons.some((r) => r.code === 'signatory_needed');
  const decision: ApplicationDecision =
    input.decision === 'approved' && needsSignatory ? 'awaiting_signatory' : input.decision;
  const signatoryEmail = stringAnswer(current.answers.q_signatory_email);

  const data = parseRow('application', applicationDecisionUpdateSchema, {
    decision,
    reasons_json: JSON.stringify([...current.reasons, reason]),
    decided_on: input.today,
    reviewed_by: input.reviewedBy,
  });
  let row: ApplicationRow;
  try {
    row = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'application.decided',
        entityType: 'application',
        entityId: input.id,
        details: { from: current.decision, to: decision, by: input.reviewedBy },
      },
      async (tx) => {
        // Only a row still in the state this request read changes, so a concurrent second
        // decision is a no-op, not an overwrite.
        const { count } = await tx.application.updateMany({
          where: { id: input.id, decision: current.decision },
          data,
        });
        if (count === 0) throw new LostDecisionRace();
        if (decision === 'awaiting_signatory' && signatoryEmail) {
          await createSignatureRequest(tx, {
            applicationId: input.id,
            customerId: current.customerId,
            email: signatoryEmail,
            today: input.today,
          });
        }
        return tx.application.findUniqueOrThrow({ where: { id: input.id } });
      }
    );
  } catch (error) {
    if (error instanceof LostDecisionRace) return { ok: false, reason: 'not_pending' };
    throw error;
  }
  return { ok: true, application: toApplicationView(row) };
}

/**
 * Inside `decideByToken`'s transaction (src/server/signatories.ts): the signatory's answer on
 * a case still in `awaiting_signatory`, with the `signatory_decided` reason. Null when the case
 * is no longer waiting (another request decided first), so the caller rolls back.
 */
export async function recordSignatoryDecision(
  tx: TransactionClient,
  input: { id: string; decision: 'approved' | 'rejected'; by: string; today: string }
): Promise<ApplicationView | null> {
  const row = await tx.application.findUnique({ where: { id: input.id } });
  if (!row) return null;
  const current = toApplicationView(row);
  if (current.decision !== 'awaiting_signatory') return null;
  const reason: StoredReason = {
    code: 'signatory_decided',
    params: { by: input.by, decision: input.decision, on: input.today },
  };
  const data = parseRow('application', applicationDecisionUpdateSchema, {
    decision: input.decision,
    reasons_json: JSON.stringify([...current.reasons, reason]),
    decided_on: input.today,
    reviewed_by: input.by,
  });
  const { count } = await tx.application.updateMany({
    where: { id: input.id, decision: 'awaiting_signatory' },
    data,
  });
  if (count === 0) return null;
  return toApplicationView(await tx.application.findUniqueOrThrow({ where: { id: input.id } }));
}

export type WithdrawApplicationResult =
  | { ok: true; application: ApplicationView }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'forbidden'; refusal: AuthzRefusal }
  | { ok: false; reason: 'refused'; refusal: WithdrawRefusal };

/** Thrown inside the withdrawal's transaction when the case moved on, so nothing is written. */
class LostWithdrawalRace extends Error {
  constructor(readonly refusal: WithdrawRefusal) {
    super(refusal.code);
  }
}

/**
 * D87. The applicant (or the admin for them) withdraws an application that is not a lease yet:
 * an approved one not signed, a manual review or a company case waiting for its signatory
 * (`withdrawalCheck`). Authorized first (D73). The row becomes `withdrawn` with a `withdrawn`
 * reason, in one transaction with its audit row; the update only applies to a row still in the
 * state read and with no contract, so a signing at the same instant leaves one winner (signing
 * re-reads the decision in its own transaction, `signContract`).
 */
export async function withdrawApplication(
  db: PrismaClient,
  input: { id: string; actor: string; today: string }
): Promise<WithdrawApplicationResult> {
  const auth = await authorize(db, input.actor, 'withdraw_application', {
    application: input.id,
  });
  if (!auth.ok) {
    return auth.reason.code === 'not_found'
      ? { ok: false, reason: 'not_found' }
      : { ok: false, reason: 'forbidden', refusal: auth.reason };
  }
  const current = await getApplication(db, input.id);
  if (!current) return { ok: false, reason: 'not_found' };
  const check = withdrawalCheck(
    current.decision,
    (await contractIdOfApplication(db, input.id)) !== null
  );
  if (!check.ok) return { ok: false, reason: 'refused', refusal: check.reason };

  const reason: StoredReason = { code: 'withdrawn', params: { by: input.actor, on: input.today } };
  const data = parseRow('application', applicationWithdrawalSchema, {
    decision: 'withdrawn',
    reasons_json: JSON.stringify([...current.reasons, reason]),
    decided_on: input.today,
  });
  try {
    const row = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'application.withdrawn',
        entityType: 'application',
        entityId: input.id,
        details: { from: current.decision, by: input.actor },
      },
      async (tx) => {
        if ((await contractIdOfApplication(tx, input.id)) !== null) {
          throw new LostWithdrawalRace({
            code: 'already_signed',
            params: { decision: current.decision },
          });
        }
        const { count } = await tx.application.updateMany({
          where: { id: input.id, decision: current.decision },
          data,
        });
        if (count === 0) {
          throw new LostWithdrawalRace({
            code: 'not_withdrawable',
            params: { decision: current.decision },
          });
        }
        return tx.application.findUniqueOrThrow({ where: { id: input.id } });
      }
    );
    return { ok: true, application: toApplicationView(row) };
  } catch (error) {
    if (error instanceof LostWithdrawalRace) {
      return { ok: false, reason: 'refused', refusal: error.refusal };
    }
    throw error;
  }
}
