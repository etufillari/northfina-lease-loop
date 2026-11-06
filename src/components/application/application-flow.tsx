'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { IdentitySummary } from '@/domain/identity';
import type { Locale } from '@/i18n/locales';
import { getT } from '@/i18n/get-t';

import ApplicationProgress from './application-progress';
import EligibilityQuestion, { type ApplicationQuestion } from './eligibility-question';
import ApplicationReview from './application-review';
import ApplicationResult, { type ApplicationResultData } from './application-result';

export type AnswerValue = string | number | string[];
export type Answers = Record<string, AnswerValue>;

export type AnswerError = {
  question_id: string;
  reason: 'empty' | 'not_an_option' | 'not_a_date' | 'not_an_email' | 'not_cents' | 'not_a_list';
};

export type Blocked = {
  reason: 'min_age' | 'residency';
  eligible_from: string | null;
};

type QuestionsResult = {
  questions: ApplicationQuestion[];
  unanswered: string[];
  dropped: string[];
  invalid: AnswerError[];
  blocked: Blocked | null;
};

type SubmittedApplication = ApplicationResultData;

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
};

type Step = 'questions' | 'review' | 'result';
type AccessState = 'loading' | 'customer' | 'guest' | 'staff' | 'error';

type ApplicationFlowProps = {
  assetId: string;
  locale: Locale;
  termMonths: number;
  downPaymentCents: number;
};

async function readApi<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !body.success) {
    throw new Error(body.error?.message ?? 'Something went wrong. Please try again.');
  }

  return body.data as T;
}

export default function ApplicationFlow({
  assetId,
  locale,
  termMonths,
  downPaymentCents,
}: ApplicationFlowProps) {
  const t = useMemo(() => getT(locale), [locale]);

  const [access, setAccess] = useState<AccessState>('loading');
  const [step, setStep] = useState<Step>('questions');

  const [questions, setQuestions] = useState<ApplicationQuestion[]>([]);
  const [answers, setAnswers] = useState<Answers>({});
  const [unanswered, setUnanswered] = useState<string[]>([]);
  const [invalid, setInvalid] = useState<AnswerError[]>([]);
  const [blocked, setBlocked] = useState<Blocked | null>(null);

  const [application, setApplication] = useState<SubmittedApplication | null>(null);

  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadQuestions = useCallback(
    async (currentAnswers: Answers, signal?: AbortSignal) => {
      const response = await fetch(
        `/api/applications/questions?locale=${encodeURIComponent(locale)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            asset_id: assetId,
            term_months: termMonths,
            down_payment_cents: downPaymentCents,
            answers: currentAnswers,
          }),
          signal,
        }
      );

      return readApi<QuestionsResult>(response);
    },
    [assetId, downPaymentCents, locale, termMonths]
  );

  // Check the current session before loading application questions.
  useEffect(() => {
    const controller = new AbortController();

    async function checkSession() {
      try {
        const response = await fetch('/api/session', {
          signal: controller.signal,
          cache: 'no-store',
        });

        const identity = await readApi<IdentitySummary | null>(response);

        if (controller.signal.aborted) return;

        if (!identity) {
          setAccess('guest');
        } else if (identity.kind === 'customer') {
          setAccess('customer');
        } else {
          setAccess('staff');
        }
      } catch {
        if (!controller.signal.aborted) {
          setAccess('error');
        }
      }
    }

    void checkSession();

    return () => controller.abort();
  }, []);

  // Load initial questions only after confirming the customer session.
  useEffect(() => {
    if (access !== 'customer') return;

    const controller = new AbortController();

    async function initialize() {
      setLoadingQuestions(true);
      setError(null);

      try {
        const result = await loadQuestions({}, controller.signal);

        if (controller.signal.aborted) return;

        setQuestions(result.questions);
        setUnanswered(result.unanswered);
        setInvalid(result.invalid);
        setBlocked(result.blocked);
      } catch (err) {
        if (controller.signal.aborted) return;

        setError(err instanceof Error ? err.message : t('application.error.loadQuestions'));
      } finally {
        if (!controller.signal.aborted) {
          setLoadingQuestions(false);
        }
      }
    }

    void initialize();

    return () => controller.abort();
  }, [access, loadQuestions, t]);

  const updateAnswer = useCallback(
    async (questionId: string, value: AnswerValue) => {
      const nextAnswers = {
        ...answers,
        [questionId]: value,
      };

      setAnswers(nextAnswers);
      setInvalid((current) => current.filter((item) => item.question_id !== questionId));
      setError(null);

      try {
        const result = await loadQuestions(nextAnswers);

        const droppedAnswers = new Set(result.dropped);
        const cleanedAnswers = Object.fromEntries(
          Object.entries(nextAnswers).filter(([id]) => !droppedAnswers.has(id))
        );

        setAnswers(cleanedAnswers);
        setQuestions(result.questions);
        setUnanswered(result.unanswered);
        setInvalid(result.invalid);
        setBlocked(result.blocked);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('application.error.loadQuestions'));
      }
    },
    [answers, loadQuestions, t]
  );

  async function continueToReview() {
    setLoadingQuestions(true);
    setError(null);

    try {
      const result = await loadQuestions(answers);

      // Remove answers that no longer apply after conditional questions change.
      const droppedIds = new Set(result.dropped);

      const nextAnswers = Object.fromEntries(
        Object.entries(answers).filter(([id]) => !droppedIds.has(id))
      );

      setAnswers(nextAnswers);
      setQuestions(result.questions);
      setUnanswered(result.unanswered);
      setInvalid(result.invalid);
      setBlocked(result.blocked);

      if (result.blocked || (result.unanswered.length === 0 && result.invalid.length === 0)) {
        setStep('review');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('application.error.validateAnswers'));
    } finally {
      setLoadingQuestions(false);
    }
  }

  async function submitApplication() {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_id: assetId,
          term_months: termMonths,
          down_payment_cents: downPaymentCents,
          answers,
        }),
      });

      const result = await readApi<SubmittedApplication>(response);

      setApplication(result);
      setStep('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('application.error.submit'));
    } finally {
      setSubmitting(false);
    }
  }

  // Access checks.
  if (access === 'loading') {
    return (
      <p className="text-sm text-stone-500" aria-live="polite">
        {t('application.access.checking')}
      </p>
    );
  }

  if (access === 'guest') {
    return (
      <section className="space-y-3 rounded-2xl border border-stone-800 bg-stone-900 p-6">
        <h1 className="text-xl font-semibold text-stone-100">
          {t('application.access.signInTitle')}
        </h1>
        <p className="text-sm text-stone-400">{t('application.access.signInDescription')}</p>
      </section>
    );
  }

  if (access === 'staff') {
    return (
      <section className="space-y-3 rounded-2xl border border-stone-800 bg-stone-900 p-6">
        <h1 className="text-xl font-semibold text-stone-100">
          {t('application.access.customerTitle')}
        </h1>
        <p className="text-sm text-stone-400">{t('application.access.customerDescription')}</p>
      </section>
    );
  }

  if (access === 'error') {
    return (
      <section className="space-y-3 rounded-2xl border border-stone-800 bg-stone-900 p-6">
        <h1 className="text-xl font-semibold text-stone-100">
          {t('application.access.errorTitle')}
        </h1>
        <p className="text-sm text-stone-400">{t('application.access.errorDescription')}</p>
      </section>
    );
  }

  const canContinue = blocked !== null || (unanswered.length === 0 && invalid.length === 0);

  return (
    <div className="space-y-8">
      <ApplicationProgress step={step} locale={locale} />

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      {step === 'questions' && (
        <section className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-stone-100">
              {t('application.title')}
            </h1>
            <p className="text-sm text-stone-400">{t('application.description')}</p>
          </div>

          {loadingQuestions ? (
            <p className="text-sm text-stone-500" aria-live="polite">
              {t('application.loadingQuestions')}
            </p>
          ) : questions.length === 0 ? (
            <p className="text-sm text-stone-400">{t('application.noQuestions')}</p>
          ) : (
            <div className="space-y-5">
              {questions.map((question) => (
                <EligibilityQuestion
                  key={question.id}
                  question={question}
                  locale={locale}
                  value={answers[question.id]}
                  error={invalid.find((item) => item.question_id === question.id)}
                  onChange={(value: AnswerValue) => updateAnswer(question.id, value)}
                  disabled={loadingQuestions}
                />
              ))}
            </div>
          )}

          {blocked && (
            <p className="rounded-xl border border-amber-900 bg-amber-950/40 p-4 text-sm text-amber-200">
              {t('application.blockedDescription')}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void continueToReview()}
              disabled={loadingQuestions || !canContinue}
              className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingQuestions ? t('application.checking') : t('application.continueToReview')}
            </button>
          </div>
        </section>
      )}

      {step === 'review' && (
        <ApplicationReview
          locale={locale}
          termMonths={termMonths}
          downPaymentCents={downPaymentCents}
          questions={questions}
          answers={answers}
          blocked={blocked}
          onBack={() => setStep('questions')}
          onSubmit={submitApplication}
          submitting={submitting}
        />
      )}

      {step === 'result' && application && (
        <ApplicationResult application={application} locale={locale} />
      )}
    </div>
  );
}
