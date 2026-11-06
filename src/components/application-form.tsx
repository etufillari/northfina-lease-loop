'use client';

// Spine step 3: the application. Shows only the questions that apply to this customer and
// this deal, ignores answers that stop applying when an earlier answer changes, and shows the
// decision (yes, no, or "a person will check") live as the customer answers. The server
// makes the same decision again when the application is sent. A fleet deal (several items
// for a business, see src/domain/fleet.ts) uses the same form and goes to /api/fleets.
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { Question } from '@/data/schemas';
import { decideApplication } from '@/domain/application';
import { isBusinessApplicant } from '@/domain/fleet';
import { signatoryEmail, waitsOnlyForSignatory } from '@/domain/signature';
import { formatEuro } from '@/domain/money';
import {
  getVisibleQuestions,
  validateQuestionAnswer,
  type EligibilityEvaluation,
  type QuestionFlowContext,
} from '@/domain/question-flow';
import { getT, type Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { QuestionField } from './question-field';
import { useSessionState } from './use-session-state';

type ApplicationFormProps = {
  questions: Question[];
  context: QuestionFlowContext;
  deal:
    | { assetId: string; termMonths: number; downPaymentCents: number }
    | { assetIds: string[]; termMonths: number };
  /** Starting answers: the chosen customer's details, or nothing for a guest. */
  initialAnswers: Record<string, string>;
  /** Who is applying (customer id, or "guest"), so two people's drafts never mix. */
  viewerKey: string;
  locale: Locale;
};

type Submitted = { id: string; decision: 'approved' | 'manual_review' | 'rejected' };

// Stable starting value for useSessionState (it compares it by identity).
const NOT_SUBMITTED: Submitted | null = null;

export function ApplicationForm(props: ApplicationFormProps) {
  const { questions, context, deal, initialAnswers, viewerKey, locale } = props;
  const t = getT(locale);
  // Kept in this tab's session storage, so switching language doesn't wipe the answers.
  const fleet = 'assetIds' in deal;
  const storageKey =
    'assetIds' in deal
      ? `fleet:${viewerKey}:${deal.assetIds.join(',')}:${deal.termMonths}`
      : `apply:${viewerKey}:${deal.assetId}:${deal.termMonths}:${deal.downPaymentCents}`;
  // The draft keeps everything typed, including answers to questions that are hidden now, so
  // switching company → private person → company gives the answers back. Only `answers` (the
  // ones that still apply) decide what is shown, what is judged and what is sent.
  const [draft, setDraft] = useSessionState(`${storageKey}:answers`, initialAnswers);
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [submitted, setSubmitted] = useSessionState(`${storageKey}:submitted`, NOT_SUBMITTED);

  const { answers, evaluation } = decideApplication(questions, draft, context);
  const visible = getVisibleQuestions(questions, answers, context);
  const answered = visible.filter((q) => answers[q.id]?.trim()).length;
  // A fleet is for businesses: a private person leases one item at a time.
  const wrongCustomerType =
    fleet && Boolean(answers.q_customer_type) && !isBusinessApplicant(answers);
  const canSend =
    !wrongCustomerType &&
    (evaluation.status === 'approved' || evaluation.status === 'manual_review');

  function answer(questionId: string, value: string) {
    setDraft((current) => ({ ...current, [questionId]: value }));
  }

  // Puts the customer's own details (what a profile would hold) back into their fields, and
  // leaves every other answer as it is. Guests have no details, so they don't get the button.
  const hasDetails = Object.keys(initialAnswers).length > 0;
  function fillMyDetails() {
    setDraft((current) => ({ ...current, ...initialAnswers }));
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setSendFailed(false);
    try {
      const response = await fetch(fleet ? '/api/fleets' : '/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...deal, answers }),
      });
      const payload = (await response.json()) as { success: boolean; data?: Submitted };
      if (!response.ok || !payload.success || !payload.data) throw new Error('not sent');
      setSubmitted(payload.data);
    } catch {
      setSendFailed(true);
    } finally {
      setSending(false);
    }
  }

  if (submitted) {
    // Card 6: waiting only for the company's signatory, who gets asked by email.
    const signatory =
      submitted.decision === 'manual_review' &&
      waitsOnlyForSignatory(
        submitted.decision,
        evaluation.reasons.map((reason) => reason.ruleId)
      )
        ? signatoryEmail(answers)
        : null;
    return (
      <section
        role="status"
        className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
      >
        <h2 className="text-lg font-semibold">{t('apply.successTitle')}</h2>
        <p className="mt-2">{t('apply.successMessage', { id: submitted.id.slice(0, 8) })}</p>
        {signatory ? (
          <p className="mt-2">{t('apply.successNext.signatory', { email: signatory })}</p>
        ) : submitted.decision !== 'rejected' ? (
          <p className="mt-2">{t(`apply.successNext.${submitted.decision}`)}</p>
        ) : null}
        {submitted.decision === 'approved' || submitted.decision === 'manual_review' || fleet ? (
          <Link
            href={`/${locale}/${fleet ? 'fleets' : 'applications'}/${submitted.id}`}
            className="mt-4 inline-block rounded-lg bg-emerald-700 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-emerald-800"
          >
            {t(
              fleet
                ? 'fleet.toFleet'
                : submitted.decision === 'approved'
                  ? 'apply.toContract'
                  : 'apply.followApplication'
            )}
          </Link>
        ) : null}
      </section>
    );
  }

  return (
    <form onSubmit={send} className="space-y-5" noValidate>
      {hasDetails ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={fillMyDetails}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-emerald-800 ring-1 ring-emerald-700/40 ring-inset hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:outline-none dark:text-emerald-300 dark:ring-emerald-400/40 dark:hover:bg-emerald-950"
          >
            {t('apply.fillMyDetails')}
          </button>
        </div>
      ) : null}
      {visible.map((question) => {
        const value = answers[question.id] ?? '';
        const check = validateQuestionAnswer(question, value, context);
        return (
          <QuestionField
            key={question.id}
            question={question}
            value={value}
            error={check.valid ? undefined : check.code}
            onChange={(next) => answer(question.id, next)}
            locale={locale}
            t={t}
          />
        );
      })}

      <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        {wrongCustomerType ? (
          <p
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
          >
            {t('fleet.businessOnly')}
          </p>
        ) : (
          <Decision evaluation={evaluation} context={context} locale={locale} t={t} />
        )}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-stone-600 dark:text-stone-400">
            {t('apply.progress', { answered, total: visible.length })}
          </p>
          <button
            type="submit"
            disabled={!canSend || sending}
            className="rounded-xl bg-emerald-700 px-6 py-2.5 font-semibold text-white shadow-sm hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? t('apply.submitting') : t('apply.submit')}
          </button>
        </div>
        {sendFailed ? (
          <p role="alert" className="text-sm font-medium text-rose-700 dark:text-rose-300">
            {t('apply.submitError')}
          </p>
        ) : null}
      </div>
    </form>
  );
}

const decisionStyles = {
  incomplete: 'border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/60',
  approved:
    'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100',
  rejected:
    'border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100',
  manual_review:
    'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
} as const;

function Decision(props: {
  evaluation: EligibilityEvaluation;
  context: QuestionFlowContext;
  locale: Locale;
  t: Translate;
}) {
  const { evaluation, context, locale, t } = props;
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const { status, reasons } = evaluation;

  return (
    <div aria-live="polite" className={`rounded-xl border p-4 ${decisionStyles[status]}`}>
      <p className="font-semibold">{t(`apply.decision.${status}`)}</p>
      {status === 'rejected' ? (
        <p className="mt-1 text-sm">{t('apply.decision.rejectedText')}</p>
      ) : null}
      {status === 'manual_review' ? (
        <p className="mt-1 text-sm">{t('apply.decision.manualReviewText')}</p>
      ) : null}
      {reasons.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {reasons.map((reason) => (
            <li key={reason.ruleId}>
              {t(`apply.reason.${reason.ruleId}`, {
                min: euro(context.minFinancedCents ?? 0),
                max: euro(context.maxFinancedCents ?? 0),
              })}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
