import type { AskWhenCondition, Question, QuestionsFile } from '@/data/schemas';
import { isValidFinnishBusinessId } from './application';

export type ApplicationAnswers = Record<string, unknown>;

export type QuestionFlowContext = {
  customerType?: string;
  category?: string;
  financedAmountCents?: number;
  termMonths?: number;
  answers: ApplicationAnswers;
};

export type BlockingReason = {
  questionId: string;
  rule: 'age_under' | 'answer_in' | 'invalid_business_id';
  message: string;
};

export type QuestionFlow = {
  applicableQuestions: Question[];
  answers: ApplicationAnswers;
  removedAnswerIds: string[];
  blockingReasons: BlockingReason[];
};

function conditionValue(condition: AskWhenCondition, context: QuestionFlowContext): unknown {
  if (condition.field === 'customer_type') return context.customerType;
  if (condition.field === 'category') return context.category;
  if (condition.field === 'financed_amount_cents') return context.financedAmountCents;
  if (condition.field === 'term_months') return context.termMonths;
  return context.answers[condition.field.slice('answers.'.length)];
}

function conditionApplies(condition: AskWhenCondition, context: QuestionFlowContext): boolean {
  const actual = conditionValue(condition, context);
  if (condition.op === 'in') {
    return typeof actual === 'string' && condition.value.includes(actual);
  }
  if (typeof actual !== 'number') return false;
  return condition.op === 'gte' ? actual >= condition.value : actual <= condition.value;
}

function questionApplies(question: Question, context: QuestionFlowContext): boolean {
  return question.ask_when.every((condition) => conditionApplies(condition, context));
}

function ageOnDate(birthDate: string, date: string): number {
  const birthYear = Number(birthDate.slice(0, 4));
  const birthMonthDay = birthDate.slice(5);
  const dateYear = Number(date.slice(0, 4));
  const birthdayPassed = date.slice(5) >= birthMonthDay;
  return dateYear - birthYear - (birthdayPassed ? 0 : 1);
}

function blockingReasonsFor(
  question: Question,
  answer: unknown,
  contractStartDate: string | undefined
): BlockingReason[] {
  if (answer === undefined || !question.blocks_application_when) return [];

  return question.blocks_application_when.flatMap<BlockingReason>((rule) => {
    if (rule.rule === 'answer_in' && typeof answer === 'string' && rule.value.includes(answer)) {
      return [
        {
          questionId: question.id,
          rule: rule.rule,
          message: `Answer to ${question.id} is not eligible.`,
        },
      ];
    }
    if (
      rule.rule === 'age_under' &&
      typeof answer === 'string' &&
      contractStartDate &&
      ageOnDate(answer, contractStartDate) < rule.value
    ) {
      return [
        {
          questionId: question.id,
          rule: rule.rule,
          message: `Applicant must be at least ${rule.value} years old on the contract start date.`,
        },
      ];
    }
    return [];
  });
}

function validationBlockingReason(question: Question, answer: unknown): BlockingReason[] {
  if (
    answer === undefined ||
    question.validation?.format !== 'finnish_business_id' ||
    typeof answer !== 'string' ||
    isValidFinnishBusinessId(answer)
  ) {
    return [];
  }

  return [
    {
      questionId: question.id,
      rule: 'invalid_business_id',
      message: 'Enter a valid Finnish business ID.',
    },
  ];
}

/**
 * Resolves the data-driven application questions in source order.
 * Questions only depend on earlier answers, so answers to questions that stop
 * applying are removed before later conditions are evaluated.
 */
export function resolveQuestionFlow(
  file: QuestionsFile,
  context: QuestionFlowContext,
  contractStartDate?: string
): QuestionFlow {
  const answers = { ...context.answers };
  const removedAnswerIds: string[] = [];
  const applicableQuestions: Question[] = [];
  const blockingReasons: BlockingReason[] = [];

  for (const question of file.questions) {
    const questionContext = { ...context, answers };
    if (!questionApplies(question, questionContext)) {
      if (question.id in answers) {
        delete answers[question.id];
        removedAnswerIds.push(question.id);
      }
      continue;
    }

    applicableQuestions.push(question);
    blockingReasons.push(...blockingReasonsFor(question, answers[question.id], contractStartDate));
    blockingReasons.push(...validationBlockingReason(question, answers[question.id]));
  }

  return { applicableQuestions, answers, removedAnswerIds, blockingReasons };
}
