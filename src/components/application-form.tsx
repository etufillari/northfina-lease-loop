'use client';

// Interactive application form displaying all questions for UX flow development.
import { useState } from 'react';
import type { Question } from '@/data/schemas';
import type { Locale } from '@/i18n/locales';

export type PlaceholderDealInfo = {
  assetId: string;
  assetName: string;
  termMonths: number;
  monthlyRentCents: number;
  formattedPrice: string;
};

type ApplicationFormProps = {
  questions: Question[];
  locale: Locale;
  dealInfo: PlaceholderDealInfo;
  labels: {
    dealSummaryTitle: string;
    placeholderNotice: string;
    assetLabel: string;
    termLabel: string;
    estimatedPriceLabel: string;
    submitButton: string;
    submittingButton: string;
    whyWeAskLabel: string;
    currencyHint: string;
    listHint: string;
    successTitle: string;
    successMessage: string;
  };
};

export function ApplicationForm({ questions, locale, dealInfo, labels }: ApplicationFormProps) {
  // All fields start empty for now (ready for future login/pre-fill)
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleInputChange = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: dealInfo.assetId,
          termMonths: dealInfo.termMonths,
          monthlyRentCents: dealInfo.monthlyRentCents,
          answers,
          actor: answers.q_full_name?.trim() || 'applicant',
        }),
      });

      const payload = (await response.json()) as {
        success: boolean;
        data?: { id: string };
        error?: { message: string };
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error?.message ?? 'Failed to submit application');
      }

      setSubmittedId(payload.data?.id ?? 'app-unknown');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'An error occurred during submission.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Placeholder Deal Summary Banner */}
      <section
        aria-labelledby="deal-summary-heading"
        className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-4 dark:border-stone-800">
          <h2 id="deal-summary-heading" className="text-lg font-semibold tracking-tight">
            {labels.dealSummaryTitle}
          </h2>
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200 ring-inset dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800">
            UX Preview
          </span>
        </div>

        <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
          {labels.placeholderNotice}
        </p>

        <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-stone-50 p-4 dark:bg-stone-800/50">
            <dt className="text-xs font-medium text-stone-500 dark:text-stone-400">
              {labels.assetLabel}
            </dt>
            <dd className="mt-1 text-base font-semibold text-stone-900 dark:text-stone-100">
              {dealInfo.assetName}
            </dd>
          </div>
          <div className="rounded-xl bg-stone-50 p-4 dark:bg-stone-800/50">
            <dt className="text-xs font-medium text-stone-500 dark:text-stone-400">
              {labels.termLabel}
            </dt>
            <dd className="mt-1 text-base font-semibold text-stone-900 dark:text-stone-100">
              {dealInfo.termMonths} months
            </dd>
          </div>
          <div className="rounded-xl bg-stone-50 p-4 dark:bg-stone-800/50">
            <dt className="text-xs font-medium text-stone-500 dark:text-stone-400">
              {labels.estimatedPriceLabel}
            </dt>
            <dd className="mt-1 text-base font-semibold text-stone-900 dark:text-stone-100">
              {dealInfo.formattedPrice}
            </dd>
          </div>
        </dl>
      </section>

      {/* Submission Success Banner */}
      {submittedId ? (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900 shadow-sm dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
        >
          <div className="flex items-center gap-3">
            <svg
              className="size-6 text-emerald-600 dark:text-emerald-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <h3 className="text-lg font-semibold">{labels.successTitle}</h3>
          </div>
          <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">
            {labels.successMessage.replace('{id}', submittedId)}
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setSubmittedId(null);
                setAnswers({});
              }}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              Start New Application
            </button>
          </div>
        </div>
      ) : null}

      {/* Error Banner */}
      {errorMessage ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
        >
          {errorMessage}
        </div>
      ) : null}

      {/* Questions Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-6">
          {questions.map((q, index) => {
            const questionTitle = q.text[locale] ?? q.text.en;
            const whyText = q.why_we_ask[locale] ?? q.why_we_ask.en;
            const inputId = `field-${q.id}`;
            const currentValue = answers[q.id] ?? '';

            return (
              <fieldset
                key={q.id}
                className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700"
              >
                <legend className="sr-only">{questionTitle}</legend>

                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-base font-semibold text-stone-900 dark:text-stone-100">
                    <span className="mr-2 text-xs font-bold text-stone-600 dark:text-stone-400">
                      {index + 1}.
                    </span>
                    {questionTitle}
                  </span>
                  <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-mono text-stone-600 dark:bg-stone-800 dark:text-stone-400">
                    {q.type}
                  </span>
                </div>

                {whyText ? (
                  <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
                    <span className="font-medium">{labels.whyWeAskLabel}: </span>
                    {whyText}
                  </p>
                ) : null}

                <div className="mt-4">
                  {/* Choice type: styled radio buttons */}
                  {q.type === 'choice' && q.options ? (
                    <div className="flex flex-wrap gap-2">
                      {q.options.map((opt) => {
                        const isSelected = currentValue === opt;
                        return (
                          <label
                            key={opt}
                            className={`flex cursor-pointer items-center rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                              isSelected
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-600/30 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-100'
                                : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'
                            }`}
                          >
                            <input
                              type="radio"
                              name={q.id}
                              value={opt}
                              checked={isSelected}
                              onChange={(e) => handleInputChange(q.id, e.target.value)}
                              className="sr-only"
                            />
                            <span>{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}

                  {/* Text type */}
                  {q.type === 'text' ? (
                    <input
                      id={inputId}
                      type="text"
                      value={currentValue}
                      onChange={(e) => handleInputChange(q.id, e.target.value)}
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:focus:bg-stone-900"
                    />
                  ) : null}

                  {/* Email type */}
                  {q.type === 'email' ? (
                    <input
                      id={inputId}
                      type="email"
                      value={currentValue}
                      onChange={(e) => handleInputChange(q.id, e.target.value)}
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:focus:bg-stone-900"
                    />
                  ) : null}

                  {/* Date type */}
                  {q.type === 'date' ? (
                    <input
                      id={inputId}
                      type="date"
                      value={currentValue}
                      onChange={(e) => handleInputChange(q.id, e.target.value)}
                      className="w-full max-w-xs rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:focus:bg-stone-900"
                    />
                  ) : null}

                  {/* Money type */}
                  {q.type === 'money' ? (
                    <div>
                      <div className="relative max-w-xs">
                        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-stone-500 dark:text-stone-400">
                          €
                        </span>
                        <input
                          id={inputId}
                          type="number"
                          step="any"
                          min="0"
                          value={currentValue}
                          onChange={(e) => handleInputChange(q.id, e.target.value)}
                          className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 pr-3.5 pl-8 text-sm text-stone-900 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:focus:bg-stone-900"
                        />
                      </div>
                      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                        {labels.currencyHint}
                      </p>
                    </div>
                  ) : null}

                  {/* List type */}
                  {q.type === 'list' ? (
                    <div>
                      <input
                        id={inputId}
                        type="text"
                        value={currentValue}
                        onChange={(e) => handleInputChange(q.id, e.target.value)}
                        placeholder="e.g. Person One, Person Two"
                        className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:focus:bg-stone-900"
                      />
                      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                        {labels.listHint}
                      </p>
                    </div>
                  ) : null}
                </div>
              </fieldset>
            );
          })}
        </div>

        {/* Submit Actions */}
        <div className="sticky bottom-4 z-10 rounded-2xl border border-stone-200 bg-white/95 p-4 shadow-lg backdrop-blur dark:border-stone-800 dark:bg-stone-900/95">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-stone-600 dark:text-stone-400">
              {Object.keys(answers).filter((k) => Boolean(answers[k])).length} of {questions.length}{' '}
              fields answered
            </p>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-700 dark:hover:bg-emerald-600"
            >
              {isSubmitting ? labels.submittingButton : labels.submitButton}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
