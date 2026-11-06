'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatEuro } from '@/domain/money';
import type {
  ApplicationAnswers,
  ApplicationDecision,
  ApplicationEvaluation,
  EligibilityReason,
  QuestionFlowResult,
} from '@/domain/applications/question-flow';
import type { QuoteData } from '@/domain/pricing/quote';
import { getT, type MessageKey } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { LeaseCalculator, type LeaseCalculatorLabels } from './lease-calculator';
import type { LeaseLimits } from '@/domain/pricing/lease-limits';
import { answerFor, answerIsPresent, ApplicationQuestion } from './application-question';

type CustomerOption = {
  id: string;
  name: string;
  type: 'consumer' | 'sole_trader' | 'company';
};

export type ApplicationFlowLabels = {
  eyebrow: string;
  title: string;
  intro: string;
  applicant: string;
  applicantHint: string;
  questionnaire: string;
  questionCount: string;
  whyWeAsk: string;
  next: string;
  back: string;
  submit: string;
  submitting: string;
  loading: string;
  previewFailed: string;
  submitFailed: string;
  answerRequired: string;
  emailInvalid: string;
  moneyHint: string;
  listHint: string;
  ready: string;
  readyBody: string;
  manualReview: string;
  rejected: string;
  decisionBody: string;
  decisionReasons: string;
  backToQuote: string;
  noApplicant: string;
};

type CustomerApplicationFlowProps = {
  assetId: string;
  date: string;
  limits: LeaseLimits;
  initialQuote: QuoteData;
  calculatorLabels: LeaseCalculatorLabels;
  labels: ApplicationFlowLabels;
  locale: Locale;
  customerOptions: CustomerOption[];
};

type ApplicationPreview = {
  quote: QuoteData;
  application: Omit<ApplicationEvaluation, 'questionFlow'> & QuestionFlowResult;
};

type PreviewResponse =
  { success: true; data: ApplicationPreview } | { success: false; error?: { code?: string } };

type ApplicationResponse =
  | { success: true; data: { application: { id: string; decision: ApplicationDecision } } }
  | { success: false; error?: { code?: string } };

type ContractResponse =
  | { success: true; data: { contract: { id: string } } }
  | { success: false; error?: { code?: string } };

type Deal = {
  quote: QuoteData;
  termMonths: number;
  downPaymentCents: number;
};

export function CustomerApplicationFlow({
  assetId,
  date,
  limits,
  initialQuote,
  calculatorLabels,
  labels,
  locale,
  customerOptions,
}: CustomerApplicationFlowProps) {
  const router = useRouter();
  const t = getT(locale);
  const defaultCustomer =
    customerOptions.find((customer) => customer.id === 'cust-aino') ?? customerOptions[0];
  const [stage, setStage] = useState<'quote' | 'questionnaire'>('quote');
  const [selectedCustomerId, setSelectedCustomerId] = useState(defaultCustomer?.id ?? '');
  const [deal, setDeal] = useState<Deal>();
  const [answers, setAnswers] = useState<ApplicationAnswers>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<ApplicationPreview>();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();

  const customer = customerOptions.find((option) => option.id === selectedCustomerId);
  const currentQuestion =
    preview?.application.decision === 'incomplete' && preview.application.nextQuestionId
      ? preview.application.activeQuestions.find(
          (question) => question.id === preview.application.nextQuestionId
        )
      : undefined;
  const questionIndex = currentQuestion
    ? preview
      ? preview.application.activeQuestions.findIndex(
          (question) => question.id === currentQuestion.id
        )
      : -1
    : -1;

  async function requestPreview(nextDeal: Deal, nextAnswers: ApplicationAnswers) {
    const response = await fetch('/api/applications/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        assetId,
        date,
        downPaymentCents: nextDeal.downPaymentCents,
        termMonths: nextDeal.termMonths,
        answers: nextAnswers,
      }),
    });
    const body = (await response.json()) as PreviewResponse;
    if (!response.ok || !body.success) throw new Error('preview_failed');
    return body.data;
  }

  async function beginApplication(quote: QuoteData) {
    if (!customer) {
      setError(labels.noApplicant);
      return;
    }

    const nextDeal = {
      quote,
      termMonths: quote.pricing.termMonths,
      downPaymentCents: quote.pricing.downPaymentCents,
    };
    const initialAnswers: ApplicationAnswers = { q_customer_type: customer.type };
    setDeal(nextDeal);
    setAnswers(initialAnswers);
    setDrafts({ q_customer_type: customer.type });
    setPreview(undefined);
    setError(undefined);
    setFieldError(undefined);
    setStage('questionnaire');
    setIsBusy(true);

    try {
      setPreview(await requestPreview(nextDeal, initialAnswers));
    } catch {
      setError(labels.previewFailed);
    } finally {
      setIsBusy(false);
    }
  }

  function goBackToQuote() {
    if (isBusy) return;
    setStage('quote');
    setError(undefined);
    setFieldError(undefined);
  }

  async function changeCustomer(customerId: string) {
    if (!deal || isBusy) return;
    const nextCustomer = customerOptions.find((option) => option.id === customerId);
    if (!nextCustomer) return;

    const nextAnswers: ApplicationAnswers = { q_customer_type: nextCustomer.type };
    setSelectedCustomerId(customerId);
    setAnswers(nextAnswers);
    setDrafts({ q_customer_type: nextCustomer.type });
    setFieldError(undefined);
    setError(undefined);
    setPreview(undefined);
    setIsBusy(true);
    try {
      setPreview(await requestPreview(deal, nextAnswers));
    } catch {
      setError(labels.previewFailed);
    } finally {
      setIsBusy(false);
    }
  }

  async function continueQuestionnaire() {
    if (!deal || !preview || !currentQuestion || isBusy) return;
    const value = answerFor(
      currentQuestion,
      drafts[currentQuestion.id],
      answers[currentQuestion.id]
    );
    if (value === undefined || !answerIsPresent(value)) {
      setFieldError(labels.answerRequired);
      return;
    }
    if (currentQuestion.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
      setFieldError(labels.emailInvalid);
      return;
    }

    const nextAnswers = { ...answers, [currentQuestion.id]: value };
    setFieldError(undefined);
    setError(undefined);
    setIsBusy(true);
    try {
      const nextPreview = await requestPreview(deal, nextAnswers);
      setAnswers(nextPreview.application.retainedAnswers);
      setPreview(nextPreview);
    } catch {
      setError(labels.previewFailed);
    } finally {
      setIsBusy(false);
    }
  }

  async function submitApplication() {
    if (!deal || !preview || preview.application.decision !== 'approved' || !customer || isBusy) {
      return;
    }

    setError(undefined);
    setIsBusy(true);
    const actor = `customer:${customer.id}`;
    try {
      const applicationResponse = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          assetId,
          date,
          downPaymentCents: deal.downPaymentCents,
          termMonths: deal.termMonths,
          answers,
          actor,
        }),
      });
      const applicationBody = (await applicationResponse.json()) as ApplicationResponse;
      if (!applicationResponse.ok || !applicationBody.success) throw new Error('submit_failed');

      const contractResponse = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          applicationId: applicationBody.data.application.id,
          signedOn: date,
          actor,
        }),
      });
      const contractBody = (await contractResponse.json()) as ContractResponse;
      if (!contractResponse.ok || !contractBody.success) throw new Error('submit_failed');
      router.push(`/${locale}/contracts/${contractBody.data.contract.id}`);
    } catch {
      setError(labels.submitFailed);
      setIsBusy(false);
    }
  }

  function updateDraft(value: string) {
    if (!currentQuestion) return;
    setDrafts((previous) => ({ ...previous, [currentQuestion.id]: value }));
    setFieldError(undefined);
  }

  if (stage === 'quote') {
    return (
      <div>
        <LeaseCalculator
          assetId={assetId}
          date={date}
          limits={limits}
          initialQuote={initialQuote}
          labels={calculatorLabels}
          locale={locale}
          onContinue={beginApplication}
        />
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200 ring-inset dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800"
          >
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section
      aria-labelledby="application-heading"
      className="rounded-3xl border border-ink-200 bg-white p-6 shadow-sm sm:p-8 dark:border-ink-800 dark:bg-ink-900"
    >
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-ink-200 pb-6 dark:border-ink-800">
        <div>
          <p className="text-sm font-medium text-brand-800 dark:text-brand-300">{labels.eyebrow}</p>
          <h2 id="application-heading" className="mt-1 text-2xl font-semibold tracking-tight">
            {labels.title}
          </h2>
          <p className="mt-2 max-w-2xl text-ink-600 dark:text-ink-400">{labels.intro}</p>
        </div>
        <button
          type="button"
          onClick={goBackToQuote}
          disabled={isBusy}
          className="text-sm font-medium text-brand-800 underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-brand-300"
        >
          ← {labels.backToQuote}
        </button>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <aside className="h-fit rounded-2xl bg-ink-100 p-5 dark:bg-ink-800">
          <label htmlFor="applicant-profile" className="font-medium">
            {labels.applicant}
          </label>
          <select
            id="applicant-profile"
            value={selectedCustomerId}
            onChange={(event) => void changeCustomer(event.target.value)}
            disabled={isBusy}
            className="mt-3 w-full rounded-xl border border-ink-300 bg-white px-3 py-2.5 text-sm dark:border-ink-600 dark:bg-ink-900"
          >
            {customerOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} · {customerTypeLabel(t, option.type)}
              </option>
            ))}
          </select>
          <p className="mt-3 text-sm leading-6 text-ink-600 dark:text-ink-300">
            {labels.applicantHint}
          </p>
          {deal ? (
            <dl className="mt-5 space-y-3 border-t border-ink-200 pt-4 text-sm dark:border-ink-700">
              <SummaryRow
                label={t('catalogue.termLength')}
                value={`${deal.termMonths} ${t('catalogue.months')}`}
              />
              <SummaryRow
                label={t('catalogue.downPayment')}
                value={formatEuro(deal.downPaymentCents, intlLocale[locale])}
              />
            </dl>
          ) : null}
        </aside>

        <div aria-live="polite" aria-busy={isBusy}>
          {isBusy && !currentQuestion && !preview ? (
            <p className="rounded-2xl bg-brand-50 p-5 text-brand-950 dark:bg-brand-950/50 dark:text-brand-100">
              {labels.loading}
            </p>
          ) : currentQuestion && preview ? (
            <div>
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-sm font-medium text-brand-800 dark:text-brand-300">
                  {labels.questionnaire}
                </p>
                <p className="text-sm text-ink-600 tabular-nums dark:text-ink-400">
                  {labels.questionCount
                    .replace('{current}', String(questionIndex + 1))
                    .replace('{total}', String(preview.application.activeQuestions.length))}
                </p>
              </div>
              <div className="mt-4 rounded-2xl border border-ink-200 p-5 dark:border-ink-700">
                <ApplicationQuestion
                  question={currentQuestion}
                  answer={answers[currentQuestion.id]}
                  draft={drafts[currentQuestion.id]}
                  locale={locale}
                  t={t}
                  labels={labels}
                  emailError={
                    currentQuestion.type === 'email' && fieldError === labels.emailInvalid
                      ? fieldError
                      : undefined
                  }
                  onChange={updateDraft}
                />
                {fieldError ? <p className="mt-3 text-sm text-rose-700">{fieldError}</p> : null}
                <button
                  type="button"
                  onClick={() => void continueQuestionnaire()}
                  disabled={isBusy}
                  className="mt-6 inline-flex items-center btn-primary"
                >
                  {isBusy ? labels.loading : labels.next}
                  <span aria-hidden="true" className="ml-2">
                    →
                  </span>
                </button>
              </div>
            </div>
          ) : preview ? (
            <DecisionPanel
              decision={preview.application.decision}
              reasons={preview.application.reasons}
              labels={labels}
              t={t}
              isBusy={isBusy}
              error={error}
              onSubmit={() => void submitApplication()}
            />
          ) : null}
          {error && preview?.application.decision !== 'approved' ? (
            <p className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200 ring-inset dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

type DecisionPanelProps = {
  decision: ApplicationDecision;
  reasons: EligibilityReason[];
  labels: ApplicationFlowLabels;
  t: ReturnType<typeof getT>;
  isBusy: boolean;
  error: string | undefined;
  onSubmit: () => void;
};

function DecisionPanel({
  decision,
  reasons,
  labels,
  t,
  isBusy,
  error,
  onSubmit,
}: DecisionPanelProps) {
  const approved = decision === 'approved';
  const tone = approved
    ? 'border-green-200 bg-green-50 text-green-950 dark:border-green-900 dark:bg-green-950/50 dark:text-green-100'
    : 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100';
  const message = approved
    ? labels.ready
    : decision === 'manual_review'
      ? labels.manualReview
      : labels.rejected;

  return (
    <div className={`rounded-2xl border p-6 ${tone}`}>
      <p className="text-sm font-medium uppercase tracking-wide">{labels.questionnaire}</p>
      <h3 className="mt-2 text-2xl font-semibold">{message}</h3>
      {approved ? (
        <>
          <p className="mt-3 leading-7">{labels.readyBody}</p>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isBusy}
            className="mt-6 inline-flex items-center btn-primary"
          >
            {isBusy ? labels.submitting : labels.submit}
            <span aria-hidden="true" className="ml-2">
              →
            </span>
          </button>
        </>
      ) : (
        <>
          <p className="mt-3 leading-7">{labels.decisionBody}</p>
          {reasons.length > 0 ? (
            <div className="mt-4">
              <p className="font-medium">{labels.decisionReasons}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {reasons.map((reason) => (
                  <li key={`${reason.code}-${reason.questionId ?? 'general'}`}>
                    {t(`application.reason.${reason.code}` as MessageKey)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
      {error ? <p className="mt-4 text-sm font-medium text-rose-700">{error}</p> : null}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-600 dark:text-ink-400">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function customerTypeLabel(t: ReturnType<typeof getT>, type: CustomerOption['type']) {
  return t(`application.customerType.${type}` as MessageKey);
}
