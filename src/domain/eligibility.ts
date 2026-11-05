// The eligibility decision: approved, declined or manual review, always with the reasons
// (rules in data/questions.json). Decides only on answers whose questions still apply.
import type { Question } from '@/data/schemas';
import { addMonthsClamped } from './calendar';
import {
  askedQuestions,
  nextQuestion,
  relevantAnswers,
  validateAnswer,
  type AnswerCheck,
  type Answers,
  type Deal,
} from './question-flow';

/** Rent incl. VAT may be at most this share of a consumer's monthly net income. */
const AFFORDABILITY_PERCENT = 30;

export interface ApplicationInput {
  deal: Deal;
  answers: Answers;
  /** First day of the lease: age is checked on this date. */
  startDate: string;
  /**
   * The highest monthly invoice total incl. VAT over the term (D-023): a lease that runs into
   * a VAT rise must stay affordable after it.
   */
  highestMonthlyGrossCents: number;
}

export type DecisionReason =
  | { rule: 'min_age'; questionId: string; minAge: number; eligibleFrom: string }
  | { rule: 'blocked_answer'; questionId: string; answer: string }
  | { rule: 'affordability'; monthlyGrossCents: number; maxMonthlyGrossCents: number }
  | { rule: 'pep_manual_review' };

export type Signer = { kind: 'applicant' } | { kind: 'signatory'; email: string };

export type Decision =
  | { status: 'incomplete'; nextQuestionId: string }
  | {
      status: 'invalid';
      questionId: string;
      reason: Extract<AnswerCheck, { ok: false }>['reason'];
    }
  | {
      status: 'decided';
      outcome: 'approved' | 'declined' | 'manual_review';
      reasons: DecisionReason[];
      signer: Signer;
    };

export function decideApplication(
  questions: readonly Question[],
  input: ApplicationInput
): Decision {
  const { answers } = relevantAnswers(questions, input.deal, input.answers);
  const asked = askedQuestions(questions, input.deal, answers);

  for (const question of asked) {
    const answer = answers[question.id];
    if (answer === undefined) continue;
    const check = validateAnswer(question, answer);
    if (!check.ok) return { status: 'invalid', questionId: question.id, reason: check.reason };
  }
  // A decline on the answers given so far is final: a question only depends on earlier answers,
  // so later answers can't un-ask the question that broke a rule (D-028). Decline at once.
  const declines = [...blockedBy(asked, answers, input.startDate), ...unaffordable(answers, input)];
  const next = nextQuestion(questions, input.deal, answers);
  if (next && declines.length === 0) return { status: 'incomplete', nextQuestionId: next.id };

  const reviews: DecisionReason[] = answers.q_pep === 'yes' ? [{ rule: 'pep_manual_review' }] : [];
  const outcome =
    declines.length > 0 ? 'declined' : reviews.length > 0 ? 'manual_review' : 'approved';

  return {
    status: 'decided',
    outcome,
    reasons: [...declines, ...reviews],
    signer:
      answers.q_can_sign === 'no' && typeof answers.q_signatory_email === 'string'
        ? { kind: 'signatory', email: answers.q_signatory_email }
        : { kind: 'applicant' },
  };
}

/** The `blocks_application_when` rules from the question bank, in question order. */
function blockedBy(
  asked: readonly Question[],
  answers: Answers,
  startDate: string
): DecisionReason[] {
  const reasons: DecisionReason[] = [];
  for (const question of asked) {
    const answer = answers[question.id];
    if (typeof answer !== 'string') continue;
    for (const block of question.blocks_application_when ?? []) {
      if (block.rule === 'age_under') {
        // The 18th birthday; someone born on 29 Feb comes of age on 28 Feb in other years.
        const eligibleFrom = addMonthsClamped(answer, block.value * 12);
        if (startDate < eligibleFrom) {
          reasons.push({
            rule: 'min_age',
            questionId: question.id,
            minAge: block.value,
            eligibleFrom,
          });
        }
      } else if (block.value.includes(answer)) {
        reasons.push({ rule: 'blocked_answer', questionId: question.id, answer });
      }
    }
  }
  return reasons;
}

/** Consumers only, and only when income was asked (from 2 000 € financed). Exactly 30 % passes. */
function unaffordable(answers: Answers, input: ApplicationInput): DecisionReason[] {
  const income = answers.q_monthly_income;
  if (answers.q_customer_type !== 'consumer' || typeof income !== 'number') return [];
  const maxMonthlyGrossCents = Math.floor((income * AFFORDABILITY_PERCENT) / 100);
  if (input.highestMonthlyGrossCents <= maxMonthlyGrossCents) return [];
  return [
    {
      rule: 'affordability',
      monthlyGrossCents: input.highestMonthlyGrossCents,
      maxMonthlyGrossCents,
    },
  ];
}
