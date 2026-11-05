'use client';

// Spine step 3: the application. Shows only the questions that apply to this customer and
// this deal, drops answers that stop applying when an earlier answer changes, and shows the
// decision (yes, no, or "a person will check") live as the customer answers. The server
// makes the same decision again when the application is sent.
import { useState, type FormEvent } from 'react';
import type { Question } from '@/data/schemas';
import { decideApplication } from '@/domain/application';
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

type ApplicationFormProps = {
  questions: Question[];
  context: QuestionFlowContext;
  deal: { assetId: string; termMonths: number; downPaymentCents: number };
  locale: Locale;
};

type Submitted = { id: string; decision: 'approved' | 'manual_review' | 'rejected' };

export function ApplicationForm({ questions, context, deal, locale }: ApplicationFormProps) {
  const t = getT(locale);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [submitted, setSubmitted] = useState<Submitted | null>(null);

  const visible = getVisibleQuestions(questions, answers, context);
  const { evaluation } = decideApplication(questions, answers, context);
  const answered = visible.filter((q) => answers[q.id]?.trim()).length;
  const canSend = evaluation.status === 'approved' || evaluation.status === 'manual_review';

  function answer(questionId: string, value: string) {
    // Keep only answers that still apply, so going back and changing an earlier answer
    // (e.g. company → private person) forgets the company questions.
    setAnswers(
      (current) =>
        decideApplication(questions, { ...current, [questionId]: value }, context).answers
    );
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setSendFailed(false);
    try {
      const response = await fetch('/api/applications', {
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
    return (
      <section
        role="status"
        className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
      >
        <h2 className="text-lg font-semibold">{t('apply.successTitle')}</h2>
        <p className="mt-2">{t('apply.successMessage', { id: submitted.id.slice(0, 8) })}</p>
        {submitted.decision !== 'rejected' ? (
          <p className="mt-2">{t(`apply.successNext.${submitted.decision}`)}</p>
        ) : null}
      </section>
    );
  }

  return (
    <form onSubmit={send} className="space-y-5" noValidate>
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

      <div className="sticky bottom-4 z-10 space-y-4 rounded-2xl border border-stone-200 bg-white/95 p-5 shadow-lg backdrop-blur dark:border-stone-800 dark:bg-stone-900/95">
        <Decision evaluation={evaluation} context={context} locale={locale} t={t} />
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
