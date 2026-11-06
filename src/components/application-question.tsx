'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { AssetCategory, Question, QuestionsFile } from '@/data/schemas';
import type { ApplicationDecision, ApplicationReason } from '@/domain/application';
import {
  resolveQuestionFlow,
  type ApplicationAnswers,
  type BlockingReason,
} from '@/domain/question-flow';
import { getT, type MessageKey } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type ApplicationQuestionProps = {
  question: Question;
  questionsFile: QuestionsFile;
  category: AssetCategory;
  financedAmountCents: number;
  contractStartDate: string;
  locale: Locale;
  quoteId?: string;
  customerId?: string;
};

export function ApplicationQuestion({
  question,
  questionsFile,
  category,
  financedAmountCents,
  contractStartDate,
  locale,
  quoteId,
  customerId,
}: ApplicationQuestionProps) {
  const [answers, setAnswers] = useState<ApplicationAnswers>({});
  const [currentQuestionId, setCurrentQuestionId] = useState(question.id);
  const [questionHistory, setQuestionHistory] = useState([question.id]);
  const [isComplete, setIsComplete] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockingReason, setBlockingReason] = useState<BlockingReason>();
  const [decision, setDecision] = useState<ApplicationDecision>();
  const [submissionError, setSubmissionError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const answerControlRef = useRef<HTMLInputElement>(null);
  const t = getT(locale);
  const currentQuestion =
    questionsFile.questions.find((candidate) => candidate.id === currentQuestionId) ?? question;
  const questionText = currentQuestion.text[locale];
  const whyText = currentQuestion.why_we_ask[locale] ?? currentQuestion.why_we_ask.en;
  const answer = answers[currentQuestion.id];
  const currentOptions = currentQuestion.options ?? [];

  useEffect(() => {
    answerControlRef.current?.focus();
  }, [currentQuestion.id]);

  async function continueFlow() {
    if (answer === undefined || answer === '') return;
    const nextAnswers = { ...answers, [currentQuestion.id]: answer };
    const customerType =
      typeof nextAnswers.q_customer_type === 'string' ? nextAnswers.q_customer_type : undefined;
    const flow = resolveQuestionFlow(
      questionsFile,
      {
        customerType,
        category,
        financedAmountCents,
        answers: nextAnswers,
      },
      contractStartDate
    );
    if (flow.blockingReasons.some((reason) => reason.questionId === currentQuestion.id)) {
      setAnswers(flow.answers);
      setIsBlocked(true);
      setBlockingReason(
        flow.blockingReasons.find((reason) => reason.questionId === currentQuestion.id)
      );
      return;
    }
    const currentIndex = flow.applicableQuestions.findIndex(
      (candidate) => candidate.id === currentQuestion.id
    );
    const nextQuestion = flow.applicableQuestions[currentIndex + 1];
    setAnswers(flow.answers);
    setIsBlocked(false);
    setBlockingReason(undefined);
    setSubmissionError(false);
    if (nextQuestion) {
      setCurrentQuestionId(nextQuestion.id);
      setQuestionHistory((current) => [...current, nextQuestion.id]);
    } else {
      setIsSubmitting(true);
      try {
        const response = await fetch('/api/applications', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            answers: flow.answers,
            category,
            financedAmountCents,
            contractStartDate,
            quoteId,
            customerId,
            actor: customerId ?? quoteId ?? 'applicant',
          }),
        });
        const body = (await response.json()) as ApplicationResponse;
        if (!response.ok || !body.success) {
          setSubmissionError(true);
          return;
        }
        setDecision(body.data.decisionResult);
        setIsComplete(true);
      } catch {
        setSubmissionError(true);
      } finally {
        setIsSubmitting(false);
      }
    }
  }

  function goBack() {
    const previousQuestionId = questionHistory.at(-2);
    if (!previousQuestionId) return;
    setCurrentQuestionId(previousQuestionId);
    setQuestionHistory((current) => current.slice(0, -1));
    setIsBlocked(false);
    setBlockingReason(undefined);
    setIsComplete(false);
  }

  if (isComplete) {
    const resultStyles =
      decision?.decision === 'approved'
        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950'
        : decision?.decision === 'declined'
          ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950'
          : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950';
    const backButtonStyles =
      decision?.decision === 'approved'
        ? 'border-emerald-700 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-300 dark:text-emerald-200 dark:hover:bg-emerald-900'
        : decision?.decision === 'declined'
          ? 'border-red-700 text-red-800 hover:bg-red-100 dark:border-red-300 dark:text-red-200 dark:hover:bg-red-900'
          : 'border-amber-700 text-amber-800 hover:bg-amber-100 dark:border-amber-300 dark:text-amber-200 dark:hover:bg-amber-900';
    return (
      <section className={`mt-10 rounded-2xl border p-6 ${resultStyles}`}>
        <h2 className="text-xl font-semibold">
          {decisionLabel(decision?.decision ?? 'declined', t)}
        </h2>
        <p className="mt-2 text-stone-700 dark:text-stone-300">{t('application.thankYou')}</p>
        {decision && decision.reasons.length > 0 && (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-stone-700 dark:text-stone-300">
            {decision.reasons.map((reason) => (
              <li key={reason}>{t(reasonLabelKey[reason])}</li>
            ))}
          </ul>
        )}
        {decision?.decision === 'approved' && (
          <Link
            href={{
              pathname: `/${locale}/contract`,
              query: {
                ...(quoteId ? { quoteId } : {}),
                ...(customerId ? { customerId } : {}),
              },
            }}
            className="mt-6 inline-flex rounded-xl bg-emerald-700 px-5 py-3 font-medium text-white transition hover:bg-emerald-800"
          >
            {t('application.continueToContract')}
          </Link>
        )}
        <button
          type="button"
          onClick={goBack}
          className={`mt-6 ml-3 rounded-xl border px-5 py-3 font-medium transition ${backButtonStyles}`}
        >
          {t('application.back')}
        </button>
      </section>
    );
  }

  function decisionLabel(
    decision: ApplicationDecision['decision'],
    t: ReturnType<typeof getT>
  ): string {
    if (decision === 'approved') return t('application.decision.approved');
    if (decision === 'manual_review') return t('application.decision.manualReview');
    return t('application.decision.declined');
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        continueFlow();
      }}
      aria-labelledby={`${currentQuestion.id}-heading`}
      className="mt-10 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900"
    >
      <p className="text-sm text-stone-600 dark:text-stone-400">
        {t('application.questionNumber', {
          number:
            questionsFile.questions.findIndex((candidate) => candidate.id === currentQuestion.id) +
            1,
        })}
      </p>
      <h2 id={`${currentQuestion.id}-heading`} className="mt-2 text-xl font-semibold">
        {questionText}
      </h2>
      <div className="relative mt-3 inline-flex group">
        <button
          type="button"
          aria-label={t('application.whyLabel')}
          aria-describedby={`${currentQuestion.id}-why`}
          className="flex size-6 items-center justify-center rounded-full border border-stone-400 text-sm font-semibold text-stone-600 outline-offset-2 hover:border-emerald-600 hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-700 dark:border-stone-500 dark:text-stone-300 dark:hover:border-emerald-400 dark:hover:text-emerald-300"
        >
          ?
        </button>
        <span
          id={`${currentQuestion.id}-why`}
          role="tooltip"
          className="invisible absolute left-8 top-1/2 z-10 w-72 -translate-y-1/2 rounded-xl bg-stone-900 px-4 py-3 text-left text-sm font-normal text-white opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 dark:bg-stone-100 dark:text-stone-900"
        >
          {whyText}
        </span>
      </div>
      {isBlocked && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
        >
          <strong>{t('application.blockedTitle')}</strong>{' '}
          {blockingReason
            ? t(blockingReasonLabelKey(blockingReason))
            : t('application.blockedDescription')}
        </p>
      )}

      <fieldset className="mt-6">
        <legend className="sr-only">{questionText}</legend>
        {currentQuestion.type === 'choice' ? (
          <div className="grid gap-3">
            {currentOptions.map((option, optionIndex) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-stone-200 p-4 has-checked:border-emerald-600 has-checked:bg-emerald-50 dark:border-stone-700 dark:has-checked:border-emerald-400 dark:has-checked:bg-emerald-950"
              >
                <input
                  ref={optionIndex === 0 ? answerControlRef : undefined}
                  type="radio"
                  name={currentQuestion.id}
                  value={option}
                  checked={answer === option}
                  onChange={() => {
                    setIsBlocked(false);
                    setBlockingReason(undefined);
                    setAnswers((current) => ({ ...current, [currentQuestion.id]: option }));
                  }}
                  className="size-4 accent-emerald-700"
                />
                <span>{optionLabel(option, t)}</span>
              </label>
            ))}
          </div>
        ) : (
          <input
            ref={answerControlRef}
            type={currentQuestion.type === 'email' ? 'email' : currentQuestion.type}
            value={typeof answer === 'string' ? answer : ''}
            onChange={(event) => {
              setIsBlocked(false);
              setBlockingReason(undefined);
              setAnswers((current) => ({ ...current, [currentQuestion.id]: event.target.value }));
            }}
            className="w-full rounded-xl border border-stone-300 bg-transparent px-4 py-3 dark:border-stone-700"
          />
        )}
      </fieldset>
      {submissionError && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
        >
          {t('application.submissionError')}
        </p>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        {questionHistory.length > 1 && (
          <button
            type="button"
            onClick={goBack}
            className="rounded-xl border border-stone-300 px-5 py-3 font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            {t('application.back')}
          </button>
        )}
        <button
          type="submit"
          disabled={answer === undefined || answer === '' || isSubmitting}
          className="rounded-xl bg-emerald-700 px-5 py-3 font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? t('application.submitting') : t('application.continue')}
        </button>
      </div>
    </form>
  );
}

type ApplicationResponse =
  | {
      success: true;
      data: { decisionResult: ApplicationDecision };
    }
  | { success: false; error: { message: string } };

const reasonLabelKey: Record<ApplicationReason, MessageKey> = {
  under_minimum_age: 'application.reason.underMinimumAge',
  unsupported_residency: 'application.reason.unsupportedResidency',
  unaffordable: 'application.reason.unaffordable',
  invalid_business_id: 'application.reason.invalidBusinessId',
  unauthorised_signatory: 'application.reason.unauthorisedSignatory',
  financed_amount_out_of_range: 'application.reason.financedAmountOutOfRange',
  pep_manual_review: 'application.reason.pepManualReview',
  missing_required_information: 'application.reason.missingInformation',
} as const;

function blockingReasonLabelKey(reason: BlockingReason): MessageKey {
  if (reason.rule === 'age_under') return reasonLabelKey.under_minimum_age;
  if (reason.rule === 'invalid_business_id') return reasonLabelKey.invalid_business_id;
  if (reason.questionId === 'q_country') return reasonLabelKey.unsupported_residency;
  return reasonLabelKey.missing_required_information;
}

function optionLabel(option: string, t: ReturnType<typeof getT>): string {
  const labels = {
    consumer: 'application.option.consumer',
    sole_trader: 'application.option.soleTrader',
    company: 'application.option.company',
    FI: 'application.option.finland',
    SE: 'application.option.sweden',
    EE: 'application.option.estonia',
    other: 'application.option.other',
    employed: 'application.option.employed',
    self_employed: 'application.option.selfEmployed',
    student: 'application.option.student',
    retired: 'application.option.retired',
    unemployed: 'application.option.unemployed',
    yes: 'application.option.yes',
    no: 'application.option.no',
    commuting: 'application.option.commuting',
    leisure: 'application.option.leisure',
    delivery: 'application.option.delivery',
  } as const;
  const key = labels[option as keyof typeof labels];
  return key ? t(key) : option.replaceAll('_', ' ');
}
