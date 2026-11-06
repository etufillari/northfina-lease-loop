'use client';

import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import type { AnswerValue, ApplicationQuestion } from './eligibility-question';
import { formatAnswer } from './format-answer';

type Blocked = {
  reason: 'min_age' | 'residency';
  eligible_from: string | null;
};

type ApplicationReviewProps = {
  locale: Locale;
  termMonths: number;
  downPaymentCents: number;
  questions: ApplicationQuestion[];
  answers: Record<string, AnswerValue>;
  blocked: Blocked | null;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
};

export default function ApplicationReview({
  locale,
  termMonths,
  downPaymentCents,
  questions,
  answers,
  blocked,
  onBack,
  onSubmit,
  submitting,
}: ApplicationReviewProps) {
  const t = getT(locale);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
          {t('application.review.title')}
        </h2>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          {t('application.review.description')}
        </p>
      </div>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
          {t('application.review.leaseDetails')}
        </h3>

        <dl className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white px-4 dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-sm text-stone-500 dark:text-stone-400">{t('asset.leaseTerm')}</dt>
            <dd className="text-sm font-medium text-stone-900 dark:text-stone-100">
              {t('asset.leaseDuration', { months: termMonths })}
            </dd>
          </div>

          <div className="flex justify-between gap-4 py-3">
            <dt className="text-sm text-stone-500 dark:text-stone-400">{t('asset.downPayment')}</dt>
            <dd className="text-sm font-medium text-stone-900 dark:text-stone-100">
              {formatEuro(downPaymentCents, locale)}
            </dd>
          </div>
        </dl>

        <p className="text-xs text-stone-500 dark:text-stone-400">
          {t('application.review.finalPricing')}
        </p>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
          {t('application.review.yourAnswers')}
        </h3>

        <dl className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white px-4 dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
          {questions.map((question) => (
            <div key={question.id} className="space-y-1 py-3">
              <dt className="text-sm text-stone-500 dark:text-stone-400">{question.text}</dt>
              <dd className="whitespace-pre-wrap break-words text-sm font-medium text-stone-900 dark:text-stone-100">
                {formatAnswer(question.id, answers[question.id], locale)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {blocked && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40"
        >
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {t('application.review.restrictionTitle')}
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            {t(`application.reason.${blocked.reason}`)}
          </p>

          {blocked.eligible_from && (
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
              {t('application.result.eligibleFrom')} {blocked.eligible_from}
            </p>
          )}

          <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
            {t('application.review.canStillSubmit')}
          </p>
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-stone-200 pt-6 dark:border-stone-800 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="rounded-xl border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-900"
        >
          {t('application.review.back')}
        </button>

        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? t('application.review.submitting') : t('application.review.submit')}
        </button>
      </div>
    </div>
  );
}
