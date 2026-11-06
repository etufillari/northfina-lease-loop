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
import { formatRemainingDuration, useApplicationReservation } from './use-application-reservation';

type Answers = Record<string, AnswerValue>;

export type EvaluateData = {
  questions: Question[];
  answers: Answers;
  dropped: string[];
  decision: EligibilityDecision;
};

export type EvaluateState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: EvaluateData };

export function shouldAcceptEvaluationResponse({
  sequence,
  latestSequence,
  isAborted,
  isSigning,
}: {
  sequence: number;
  latestSequence: number;
  isAborted: boolean;
  isSigning: boolean;
}): boolean {
  if (isAborted) return false;
  if (isSigning) return false;
  if (sequence !== latestSequence) return false;
  return true;
}

export function canSignApplication({
  isSigning,
  isEvaluating,
  signTarget,
  deal,
  state,
  latestSequence,
  evaluatedSequence,
}: {
  isSigning: boolean;
  isEvaluating: boolean;
  signTarget?: SignTarget;
  deal: ApplicationDeal;
  state: EvaluateState;
  latestSequence: number;
  evaluatedSequence: number;
}): boolean {
  if (isSigning || isEvaluating) return false;
  if (!signTarget) return false;
  if (state.status !== 'ready') return false;
  if (state.data.decision.decision !== 'yes') return false;
  if (latestSequence !== evaluatedSequence) return false;
  if (signTarget.termMonths !== deal.term_months) return false;
  return true;
}

export function getSigningActor(answers: Answers): string {
  const rawActor =
    typeof answers.q_email === 'string' && answers.q_email.trim().length > 0
      ? answers.q_email.trim()
      : typeof answers.q_business_id === 'string' && answers.q_business_id.trim().length > 0
        ? answers.q_business_id.trim()
        : 'customer';
  return rawActor.slice(0, 100);
}

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
  offeredOn?: string;
};

/** Wait for typing to pause before asking the server. */
const DEBOUNCE_MS = 250;

export function ApplicationForm({
  locale,
  deal,
  signTarget,
  initialToken,
  initialReservationType = 'standard',
  children,
}: {
  locale: Locale;
  deal: ApplicationDeal;
  /** Provided when the deal has a valid contract quote that can be signed upon approval. */
  signTarget?: SignTarget;
  /** Initial reservation token if passed from page or previous navigation. */
  initialToken?: string;
  /** Initial reservation type ('standard' | 'offer'). */
  initialReservationType?: 'standard' | 'offer';
  /** Rendered above the decision in the side column: the lease summary. */
  children?: ReactNode;
}) {
  const t = getT(locale);
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>({});
  const [state, setState] = useState<EvaluateState>({ status: 'loading' });
  const [isEvaluating, setIsEvaluating] = useState(true);
  const [removed, setRemoved] = useState<string[]>([]);
  const [isSigning, setIsSigning] = useState(false);
  const [isCreatingOffer, setIsCreatingOffer] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  // Question texts seen so far, so a removed answer can be named after its question is gone.
  const seen = useRef(new Map<string, Question>());
  // Race condition guards
  const latestSequenceRef = useRef(0);
  const evaluatedSequenceRef = useRef(0);
  const isSigningRef = useRef(false);
  const isEvaluatingRef = useRef(true);
  const activeAbortControllerRef = useRef<AbortController | null>(null);

  const {
    token,
    displayResState,
    reservationType,
    expiresAt,
    remainingSec,
    isReleasing,
    handleCancelApplication,
    handleReReserve,
    updateOfferCreated,
  } = useApplicationReservation({
    signTarget,
    initialToken,
    initialReservationType,
    state,
    locale,
    onNavigateHome: () => router.push(`/${locale}`),
  });

  const { category, financed_amount_cents, term_months, monthly_rent_incl_vat_cents } = deal;
  useEffect(() => {
    if (isSigningRef.current) return;

    const sequence = ++latestSequenceRef.current;
    isEvaluatingRef.current = true;
    setIsEvaluating(true);

    const controller = new AbortController();
    activeAbortControllerRef.current = controller;

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

        if (
          !shouldAcceptEvaluationResponse({
            sequence,
            latestSequence: latestSequenceRef.current,
            isAborted: controller.signal.aborted,
            isSigning: isSigningRef.current,
          })
        ) {
          return;
        }

        const json = (await response.json()) as { success: boolean; data?: EvaluateData };

        if (
          !shouldAcceptEvaluationResponse({
            sequence,
            latestSequence: latestSequenceRef.current,
            isAborted: controller.signal.aborted,
            isSigning: isSigningRef.current,
          })
        ) {
          return;
        }

        if (!json.success || !json.data) throw new Error('evaluate failed');

        for (const question of json.data.questions) seen.current.set(question.id, question);
        if (json.data.dropped.length > 0) {
          setRemoved(json.data.dropped.map((id) => seen.current.get(id)?.text[locale] ?? id));
          setAnswers(json.data.answers); // the next request confirms nothing else changes
        }
        evaluatedSequenceRef.current = sequence;
        isEvaluatingRef.current = false;
        setIsEvaluating(false);
        setState({ status: 'ready', data: json.data });
      } catch {
        if (
          !controller.signal.aborted &&
          sequence === latestSequenceRef.current &&
          !isSigningRef.current
        ) {
          isEvaluatingRef.current = false;
          setIsEvaluating(false);
          setState({ status: 'error' });
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (activeAbortControllerRef.current === controller) {
        activeAbortControllerRef.current = null;
      }
    };
  }, [answers, category, financed_amount_cents, term_months, monthly_rent_incl_vat_cents, locale]);

  function change(id: string, value: AnswerValue | undefined) {
    if (isSigningRef.current) return;
    setRemoved([]);
    setSignError(null);
    latestSequenceRef.current++;
    isEvaluatingRef.current = true;
    setIsEvaluating(true);
    activeAbortControllerRef.current?.abort();
    activeAbortControllerRef.current = null;

    setAnswers((current) => {
      const next = { ...current };
      if (value === undefined) delete next[id];
      else next[id] = value;
      return next;
    });
  }

  async function handleCreateOffer() {
    if (!signTarget || isCreatingOffer || isSigningRef.current || isEvaluatingRef.current) return;
    setIsCreatingOffer(true);
    setSignError(null);
    const actor = getSigningActor(answers);

    try {
      const response = await fetch(
        `/api/assets/${encodeURIComponent(signTarget.assetId)}/reserve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actor,
            token: token ?? undefined,
            reservationType: 'offer',
            validityDays: 14,
            termMonths: signTarget.termMonths,
            downPaymentCents: signTarget.downPaymentCents,
          }),
        }
      );
      const json = (await response.json()) as {
        success?: boolean;
        data?: { reservation: { token: string; expiresAt: string } };
      };
      if (!response.ok || !json.success || !json.data) {
        throw new Error('offer creation failed');
      }
      updateOfferCreated(json.data.reservation.token, json.data.reservation.expiresAt);
    } catch {
      setSignError(t('apply.signError'));
    } finally {
      setIsCreatingOffer(false);
    }
  }

  async function handleSign() {
    if (
      !canSignApplication({
        isSigning: isSigningRef.current,
        isEvaluating: isEvaluatingRef.current,
        signTarget,
        deal,
        state,
        latestSequence: latestSequenceRef.current,
        evaluatedSequence: evaluatedSequenceRef.current,
      })
    ) {
      return;
    }
    if (!signTarget) return;

    // Synchronously acquire signing lock to prevent double-clicks
    isSigningRef.current = true;
    setIsSigning(true);
    setSignError(null);

    // Cancel any active evaluation so in-flight requests cannot race with signing
    activeAbortControllerRef.current?.abort();
    activeAbortControllerRef.current = null;
    const priorSequence = latestSequenceRef.current;
    latestSequenceRef.current++;
    const actor = getSigningActor(answers);

    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(signTarget.assetId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'reserved', actor, token: token ?? undefined }),
      });
      const json = (await response.json()) as { success?: boolean };
      if (!response.ok || !json.success) {
        throw new Error('sign failed');
      }

      sessionStorage.removeItem(`lease_loop_res_${signTarget.assetId}`);

      const params = new URLSearchParams({
        asset: signTarget.assetId,
        term: String(signTarget.termMonths),
        down: String(signTarget.downPaymentCents),
        signedOn: signTarget.signedOn,
        ...(token ? { token } : {}),
      });
      router.push(`/${locale}/invoices?${params.toString()}`);
    } catch {
      isSigningRef.current = false;
      setIsSigning(false);
      latestSequenceRef.current = priorSequence;
      setSignError(t('apply.signError'));
    }
  }

  const data = state.status === 'ready' ? state.data : null;
  const offerDetails =
    reservationType === 'offer' && token && expiresAt && signTarget
      ? {
          token,
          expiresAt,
          assetId: signTarget.assetId,
          termMonths: signTarget.termMonths,
          downPaymentCents: signTarget.downPaymentCents,
        }
      : null;

  return (
    <div className="grid gap-[32px] lg:grid-cols-[minmax(0,1fr)_22rem]">
      <form
        aria-labelledby="questions-heading"
        aria-busy={state.status === 'loading' || isEvaluating}
        onSubmit={(event) => event.preventDefault()}
        className="space-y-[24px] rounded-[12px] border border-[#dad9d8] bg-[#FFFFFF] p-[24px] text-[#353331] shadow-sm dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100"
      >
        <h2 id="questions-heading" className="text-[1.375rem] leading-tight font-bold">
          {t('apply.questions.heading')}
        </h2>
        {displayResState === 'active' ? (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-[12px] rounded-[8px] border border-[#ccd7e6] bg-[#f6f7f8] p-[16px] text-[#123054] dark:border-sky-950 dark:bg-stone-800/80 dark:text-sky-200"
          >
            <div className="flex items-center gap-[8px]">
              <span className="inline-block size-2 rounded-full bg-[#16A34A] animate-pulse" />
              <span className="font-semibold">{t('apply.reservation.held')}</span>
              <span className="text-[0.875rem] text-[#615b57] dark:text-stone-300">
                •{' '}
                {t('apply.reservation.expiresIn', { time: formatRemainingDuration(remainingSec) })}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCancelApplication}
              disabled={isReleasing}
              className="rounded-[8px] border border-[#dad9d8] bg-transparent px-[12px] py-[6px] text-[0.75rem] font-semibold text-[#615b57] transition-colors hover:bg-[#FFFFFF] dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              {t('apply.reservation.cancel')}
            </button>
          </div>
        ) : null}

        {displayResState === 'conflict' ? (
          <div
            role="alert"
            className="rounded-[8px] border border-[#fecaca] bg-[#fef2f2] p-[16px] text-[#991b1b] dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            <p className="font-semibold">{t('apply.reservation.conflict')}</p>
            <button
              type="button"
              onClick={() => router.push(`/${locale}`)}
              className="mt-[12px] rounded-[8px] bg-[#1a65c1] px-[16px] py-[8px] text-[0.875rem] font-semibold text-[#FFFFFF] hover:bg-[#1354a5]"
            >
              {t('invoices.backToCatalogue')}
            </button>
          </div>
        ) : null}

        {displayResState === 'error' ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-[12px] rounded-[8px] border border-[#e9dac8] bg-[#f8f7f6] p-[16px] text-[#5c360a] dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <p className="font-semibold">{t('apply.error')}</p>
            <button
              type="button"
              onClick={handleReReserve}
              className="rounded-[8px] bg-[#1a65c1] px-[16px] py-[8px] text-[0.875rem] font-semibold text-[#FFFFFF] hover:bg-[#1354a5]"
            >
              {t('apply.reservation.renew')}
            </button>
          </div>
        ) : null}

        {displayResState === 'expired' ? (
          <div
            role="alert"
            className="rounded-[8px] border border-[#e9dac8] bg-[#f8f7f6] p-[16px] text-[#5c360a] dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <p className="font-semibold">{t('apply.reservation.expired')}</p>
            <div className="mt-[12px] flex items-center gap-[12px]">
              <button
                type="button"
                onClick={handleReReserve}
                className="rounded-[8px] bg-[#1a65c1] px-[16px] py-[8px] text-[0.875rem] font-semibold text-[#FFFFFF] hover:bg-[#1354a5]"
              >
                {t('apply.reservation.renew')}
              </button>
              <button
                type="button"
                onClick={() => router.push(`/${locale}`)}
                className="rounded-[8px] border border-[#dad9d8] bg-transparent px-[16px] py-[8px] text-[0.875rem] font-semibold text-[#615b57] hover:bg-[#FFFFFF] dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                {t('invoices.backToCatalogue')}
              </button>
            </div>
          </div>
        ) : null}

        {displayResState === 'released' ? (
          <div
            role="status"
            className="rounded-[8px] border border-[#ccd7e6] bg-[#f6f7f8] p-[16px] text-[#123054] dark:border-sky-950 dark:bg-stone-800/80 dark:text-sky-200"
          >
            <p className="font-semibold">{t('apply.reservation.rejectedNotice')}</p>
          </div>
        ) : null}

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

        {state.status === 'loading' || isEvaluating ? (
          <p className="text-[#615b57] dark:text-stone-400">{t('apply.checking')}</p>
        ) : null}
        {state.status === 'error' && !isEvaluating ? (
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
              onSign={signTarget && displayResState === 'active' ? handleSign : undefined}
              isSigning={isSigning}
              isEvaluating={isEvaluating}
              signError={signError}
              onCreateOffer={
                signTarget && displayResState === 'active' && reservationType === 'standard'
                  ? handleCreateOffer
                  : undefined
              }
              isCreatingOffer={isCreatingOffer}
              offerDetails={offerDetails}
            />
          ) : null}
        </div>
      </aside>
    </div>
  );
}
