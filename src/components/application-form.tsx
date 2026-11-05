'use client';

// The application form (Spine step 3). It sends the whole form state to
// POST /api/applications/evaluate after every change and draws what comes back: the questions
// that apply, a note about answers that were removed, and the decision.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Question } from '@/data/schemas';
import type { EligibilityDecision } from '@/domain/eligibility';
import type { AnswerValue } from '@/domain/question-flow';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { DecisionPanel } from './decision-panel';
import { QuestionField } from './question-field';

type Answers = Record<string, AnswerValue>;

type EvaluateData = {
  questions: Question[];
  answers: Answers;
  dropped: string[];
  decision: EligibilityDecision;
};

type EvaluateState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: EvaluateData };

export type ApplicationDeal = {
  category: string;
  financed_amount_cents: number;
  term_months: number;
  /** Monthly rent incl. VAT from the contract quote. Without it the affordability rule is skipped. */
  monthly_rent_incl_vat_cents?: number;
};

export type SignTarget = {
  assetId: string;
  termMonths: number;
  downPaymentCents: number;
  signedOn: string;
};

/** Wait for typing to pause before asking the server. */
const DEBOUNCE_MS = 250;

export function ApplicationForm({
  locale,
  deal,
  signTarget,
  children,
}: {
  locale: Locale;
  deal: ApplicationDeal;
  /** Provided when the deal has a valid contract quote that can be signed upon approval. */
  signTarget?: SignTarget;
  /** Rendered above the decision in the side column: the lease summary. */
  children?: ReactNode;
}) {
  const t = getT(locale);
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>({});
  const [state, setState] = useState<EvaluateState>({ status: 'loading' });
  const [removed, setRemoved] = useState<string[]>([]);
  const [isSigning, setIsSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  // Question texts seen so far, so a removed answer can be named after its question is gone.
  const seen = useRef(new Map<string, Question>());

  const { category, financed_amount_cents, term_months, monthly_rent_incl_vat_cents } = deal;
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/applications/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deal: { category, financed_amount_cents, term_months },
            answers,
            ...(monthly_rent_incl_vat_cents === undefined ? {} : { monthly_rent_incl_vat_cents }),
          }),
          signal: controller.signal,
        });
        const json = (await response.json()) as { success: boolean; data?: EvaluateData };
        if (!json.success || !json.data) throw new Error('evaluate failed');

        for (const question of json.data.questions) seen.current.set(question.id, question);
        if (json.data.dropped.length > 0) {
          setRemoved(json.data.dropped.map((id) => seen.current.get(id)?.text[locale] ?? id));
          setAnswers(json.data.answers); // the next request confirms nothing else changes
        }
        setState({ status: 'ready', data: json.data });
      } catch {
        if (!controller.signal.aborted) setState({ status: 'error' });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [answers, category, financed_amount_cents, term_months, monthly_rent_incl_vat_cents, locale]);

  function change(id: string, value: AnswerValue | undefined) {
    setRemoved([]);
    setSignError(null);
    setAnswers((current) => {
      const next = { ...current };
      if (value === undefined) delete next[id];
      else next[id] = value;
      return next;
    });
  }

  async function handleSign() {
    if (!signTarget || isSigning) return;
    setIsSigning(true);
    setSignError(null);

    const rawActor =
      typeof answers.q_email === 'string' && answers.q_email.trim().length > 0
        ? answers.q_email.trim()
        : typeof answers.q_business_id === 'string' && answers.q_business_id.trim().length > 0
          ? answers.q_business_id.trim()
          : 'customer';
    const actor = rawActor.slice(0, 100);

    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(signTarget.assetId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'reserved', actor }),
      });
      const json = (await response.json()) as { success?: boolean };
      if (!response.ok || !json.success) {
        throw new Error('sign failed');
      }

      const params = new URLSearchParams({
        asset: signTarget.assetId,
        term: String(signTarget.termMonths),
        down: String(signTarget.downPaymentCents),
        signedOn: signTarget.signedOn,
      });
      router.push(`/${locale}/invoices?${params.toString()}`);
    } catch {
      setSignError(t('apply.signError'));
      setIsSigning(false);
    }
  }

  const data = state.status === 'ready' ? state.data : null;

  return (
    <div className="grid gap-[32px] lg:grid-cols-[minmax(0,1fr)_22rem]">
      <form
        aria-labelledby="questions-heading"
        aria-busy={state.status === 'loading'}
        onSubmit={(event) => event.preventDefault()}
        className="space-y-[24px] rounded-[12px] border border-[#dad9d8] bg-[#FFFFFF] p-[24px] text-[#353331] shadow-sm dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100"
      >
        <h2 id="questions-heading" className="text-[1.375rem] leading-tight font-bold">
          {t('apply.questions.heading')}
        </h2>

        {removed.length > 0 ? (
          <div
            role="status"
            className="rounded-[8px] border border-[#ccd7e6] bg-[#f6f7f8] p-[16px] text-[#123054] dark:border-sky-950 dark:bg-stone-800/80 dark:text-sky-200"
          >
            <p className="font-semibold">{t('apply.dropped')}</p>
            <ul className="mt-[4px] list-disc pl-[20px]">
              {removed.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {state.status === 'loading' ? (
          <p className="text-[#615b57] dark:text-stone-400">{t('apply.checking')}</p>
        ) : null}
        {state.status === 'error' ? (
          <p role="alert" className="text-[#DC2626] dark:text-red-400">
            {t('apply.error')}
          </p>
        ) : null}

        {data?.questions.map((question) => (
          <QuestionField
            key={question.id}
            question={question}
            locale={locale}
            t={t}
            value={answers[question.id]}
            onChange={(value) => change(question.id, value)}
          />
        ))}
      </form>

      <aside className="space-y-[24px] lg:sticky lg:top-[24px] lg:self-start">
        {children}
        <div aria-live="polite">
          {data ? (
            <DecisionPanel
              decision={data.decision}
              locale={locale}
              t={t}
              onSign={signTarget ? handleSign : undefined}
              isSigning={isSigning}
              signError={signError}
            />
          ) : null}
        </div>
      </aside>
    </div>
  );
}
