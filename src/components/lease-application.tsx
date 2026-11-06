'use client';
import { getT } from '@/i18n/get-t';
import { explainDecision } from '@/i18n/decision-reason';

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { applicableQuestions, pruneQuestionAnswers } from '@/domain/question-flow';
import type { Customer, Question } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import type { Locale } from '@/i18n/locales';
import { intlLocale } from '@/i18n/locales';

export type LeaseApplicationLabels = {
  reserve: string;
  reservationInfo: string;
  reservationError: string;
  questionStep: string;
  why: string;
  continue: string;
  finish: string;
  complete: string;
  validationError: string;
  leaveWarning: string;
  bindingWarning: string;
  finishing: string;
  signingError: string;
  checkoutTitle: string;
  exitPolicy: string;
  underage: string;
  manualReview: string;
  rejected: string;
  checkoutMonthlyRent: string;
  checkoutTerm: string;
  checkoutPaymentDue: string;
  checkoutPriceList: string;
  months: string;
  days: string;
};

type LeaseOffer = {
  downPaymentCents: number;
  termMonths: number;
  monthlyNetCents: number;
  priceListVersion: number;
  paymentDueDays: number;
};

type LeaseApplicationContextValue = {
  reserved: boolean;
  reserving: boolean;
  error: string | null;
  reserve: () => Promise<void>;
  labels: LeaseApplicationLabels;
  questions: readonly Question[];
  answers: Record<string, string>;
  setAnswers: (answers: Record<string, string>) => void;
  validationError: string | null;
  setValidationError: (message: string | null) => void;
  completed: boolean;
  complete: () => void;
  release: () => Promise<void>;
  today: string;
  offer: LeaseOffer;
  setOffer: (offer: LeaseOffer) => void;
  customer: Customer | null;
  assetId: string;
};

const LeaseApplicationContext = createContext<LeaseApplicationContextValue | null>(null);

export function LeaseApplication({
  assetId,
  category,
  listPriceCents,
  questions,
  labels,
  customer,
  today,
  initialOffer,
  children,
}: {
  assetId: string;
  category: string;
  listPriceCents: number;
  questions: readonly Question[];
  labels: LeaseApplicationLabels;
  customer: Customer | null;
  today: string;
  initialOffer: LeaseOffer;
  children: ReactNode;
}) {
  const [reserved, setReserved] = useState(false);
  const [reserving, setReserving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    if (!customer) return {};
    const answers: Record<string, string> = {
      q_customer_type: customer.type,
      q_full_name: customer.name,
      q_email: customer.email,
      q_country: customer.country,
      q_pep: customer.is_pep ? 'yes' : 'no',
    };
    if ('birth_date' in customer) answers.q_birth_date = customer.birth_date;
    if ('employment' in customer) answers.q_employment = customer.employment;
    if ('monthly_net_income_cents' in customer) {
      answers.q_monthly_income = String(customer.monthly_net_income_cents / 100);
    }
    if ('business_id' in customer) answers.q_business_id = customer.business_id;
    if ('vat_registered' in customer)
      answers.q_vat_registered = customer.vat_registered ? 'yes' : 'no';
    if ('applicant_can_sign' in customer) {
      answers.q_can_sign = customer.applicant_can_sign ? 'yes' : 'no';
    }
    if ('annual_revenue_cents' in customer) {
      answers.q_annual_revenue = String(customer.annual_revenue_cents / 100);
    }
    return answers;
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [offer, setOffer] = useState(initialOffer);
  const navigatingAwayRef = useRef(false);

  const release = useCallback(async () => {
    await fetch(`/api/assets/${assetId}/release`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
      keepalive: true,
    }).catch((error: unknown) => {
      console.error('Unable to release the leasing reservation:', error);
    });
    setReserved(false);
  }, [assetId]);

  useEffect(() => {
    if (!reserved || completed) return;

    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      if (navigatingAwayRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    }

    function confirmLinkNavigation(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest('a');
      if (!link || link.target === '_blank' || !link.href.startsWith(window.location.origin)) {
        return;
      }
      if (!window.confirm(labels.leaveWarning)) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      navigatingAwayRef.current = true;
      void release().finally(() => {
        window.location.assign(link.href);
      });
    }

    function releaseOnPageHide() {
      void release();
    }

    window.addEventListener('beforeunload', warnBeforeLeaving);
    window.addEventListener('pagehide', releaseOnPageHide);
    document.addEventListener('click', confirmLinkNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeLeaving);
      window.removeEventListener('pagehide', releaseOnPageHide);
      document.removeEventListener('click', confirmLinkNavigation, true);
    };
  }, [completed, labels.leaveWarning, release, reserved]);

  const facts = useMemo(
    () => ({
      customerType: answers.q_customer_type ?? customer?.type ?? '',
      category,
      financedCents: Math.max(0, listPriceCents - offer.downPaymentCents),
      termMonths: offer.termMonths,
    }),
    [
      answers.q_customer_type,
      customer?.type,
      category,
      listPriceCents,
      offer.downPaymentCents,
      offer.termMonths,
    ]
  );
  const visibleQuestions = useMemo(
    () => applicableQuestions(questions, facts, answers),
    [questions, facts, answers]
  );
  function updateAnswers(next: Record<string, string>) {
    setAnswers(
      pruneQuestionAnswers(
        questions,
        { ...facts, customerType: next.q_customer_type ?? facts.customerType },
        next
      )
    );
  }

  async function reserve() {
    setReserving(true);
    setError(null);
    try {
      const response = await fetch(`/api/assets/${assetId}/reserve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = (await response.json()) as { success: boolean };
      if (!response.ok || !result.success) {
        setError(labels.reservationError);
        return;
      }
      setReserved(true);
    } catch {
      setError(labels.reservationError);
    } finally {
      setReserving(false);
    }
  }

  return (
    <LeaseApplicationContext.Provider
      value={{
        reserved,
        reserving,
        error,
        reserve,
        labels,
        questions: visibleQuestions,
        answers,
        setAnswers: updateAnswers,
        validationError,
        setValidationError,
        completed,
        complete: () => setCompleted(true),
        release,
        today,
        offer,
        setOffer,
        customer,
        assetId,
      }}
    >
      {children}
    </LeaseApplicationContext.Provider>
  );
}

export function LeaseStartButton({
  available,
  canStart,
}: {
  available: boolean;
  canStart: boolean;
}) {
  const { reserving, error, reserve, labels } = useLeaseApplicationContext();
  return (
    <div className="mt-8 border-t border-stone-200 pt-6 dark:border-stone-800">
      <button
        type="button"
        onClick={reserve}
        disabled={reserving || !available || !canStart}
        className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 disabled:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:disabled:bg-stone-700 dark:disabled:text-stone-400"
      >
        {labels.reserve}
      </button>
      <p className="mt-2 h-5 text-xs text-stone-500 dark:text-stone-400">
        {labels.reservationInfo}
      </p>
      <div className="mt-1 h-10" aria-live="polite">
        {error ? (
          <p className="line-clamp-2 text-sm text-red-700 dark:text-red-300">{error}</p>
        ) : null}
      </div>
    </div>
  );
}

export function LeaseQuestions({ locale }: { locale: Locale }) {
  const {
    reserved,
    labels,
    questions,
    answers,
    setAnswers,
    validationError,
    setValidationError,
    complete,
    today,
    offer,
    customer,
    assetId,
  } = useLeaseApplicationContext();
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [signed, setSigned] = useState(false);
  const finishStartedRef = useRef(false);
  const applicationRef = useRef<HTMLDivElement>(null);
  const question = questions[step];

  useEffect(() => {
    if (reserved) {
      applicationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      applicationRef.current?.focus();
    }
  }, [reserved]);

  if (!question) {
    if (signed) {
      return (
        <p
          ref={applicationRef}
          tabIndex={-1}
          className="mt-8 border-t border-stone-200 pt-6 text-sm text-emerald-800 outline-none dark:border-stone-800 dark:text-emerald-300"
        >
          {labels.complete}
        </p>
      );
    }
    return (
      <div
        ref={applicationRef}
        tabIndex={-1}
        className="mt-8 border-t border-stone-200 pt-6 text-sm text-emerald-800 outline-none dark:border-stone-800 dark:text-emerald-300"
      >
        <section className="rounded-xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-800">
          <h2 className="text-base font-semibold">{labels.checkoutTitle}</h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-stone-600 dark:text-stone-400">{labels.checkoutMonthlyRent}</dt>
              <dd className="font-semibold">
                {formatEuro(offer.monthlyNetCents, intlLocale[locale])}
              </dd>
            </div>
            <div>
              <dt className="text-stone-600 dark:text-stone-400">{labels.checkoutTerm}</dt>
              <dd className="font-semibold">
                {labels.months.replace('{count}', String(offer.termMonths))}
              </dd>
            </div>
            <div>
              <dt className="text-stone-600 dark:text-stone-400">{labels.checkoutPaymentDue}</dt>
              <dd className="font-semibold">
                {labels.days.replace('{count}', String(offer.paymentDueDays))}
              </dd>
            </div>
            <div>
              <dt className="text-stone-600 dark:text-stone-400">{labels.checkoutPriceList}</dt>
              <dd className="font-semibold">{offer.priceListVersion}</dd>
            </div>
          </dl>
        </section>
        <p className="mt-3 text-sm">{labels.exitPolicy}</p>
        <button
          type="button"
          className="mt-4 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800"
          onClick={() => void finishApplication()}
          disabled={finishing}
        >
          {finishing ? labels.finishing : labels.finish}
        </button>
      </div>
    );
  }

  async function finishApplication() {
    if (finishStartedRef.current || finishing || signed || !customer) return;
    if (!window.confirm(labels.bindingWarning)) return;
    finishStartedRef.current = true;
    setFinishing(true);
    setValidationError(null);
    let completedSuccessfully = false;
    try {
      const applicationResponse = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          answers,
          customerId: customer.id,
          assetId,
          startDate: today,
          termMonths: offer.termMonths,
          downPaymentCents: offer.downPaymentCents,
          priceListVersion: offer.priceListVersion,
          offerExpiresOn: today,
        }),
      });
      const applicationResult = (await applicationResponse.json()) as {
        success: boolean;
        data?: { id: string; status: string; decisionReason?: string };
      };
      if (!applicationResponse.ok || !applicationResult.success || !applicationResult.data) {
        setValidationError(labels.signingError);
        return;
      }
      if (applicationResult.data.status !== 'APPROVED') {
        setValidationError(
          `${applicationResult.data.status === 'MANUAL_REVIEW' ? labels.manualReview : labels.rejected} ${explainDecision(applicationResult.data.decisionReason, getT(locale))}`
        );
        return;
      }
      const signResponse = await fetch(`/api/applications/${applicationResult.data.id}/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signerId: customer.id }),
      });
      const signResult = (await signResponse.json()) as { success: boolean };
      if (!signResponse.ok || !signResult.success) {
        setValidationError(labels.signingError);
        return;
      }
      complete();
      setSigned(true);
      completedSuccessfully = true;
      window.location.assign(`/${locale}/leases`);
    } catch (error: unknown) {
      console.error('Unable to complete leasing contract:', error);
      setValidationError(labels.signingError);
    } finally {
      if (!completedSuccessfully) {
        finishStartedRef.current = false;
        setFinishing(false);
      }
    }
  }

  const answer = answers[question.id] ?? '';
  const questionText = question.text[locale];
  const whyText = question.why_we_ask[locale] ?? question.why_we_ask.en;
  return (
    <div
      ref={applicationRef}
      tabIndex={-1}
      aria-disabled={!reserved}
      className={`mt-8 border-t border-stone-200 pt-6 outline-none dark:border-stone-800 ${
        reserved ? '' : 'opacity-50'
      }`}
    >
      <p className="text-sm text-stone-600 dark:text-stone-400">
        {labels.questionStep
          .replace('{current}', String(step + 1))
          .replace('{total}', String(questions.length))}
      </p>
      <label htmlFor={question.id} className="mt-3 block text-lg font-semibold">
        {questionText}
      </label>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
        <span className="font-medium">{labels.why}:</span> {whyText}
      </p>
      {question.type === 'choice' ? (
        <select
          id={question.id}
          value={answer}
          disabled={!reserved}
          onChange={(event) => setAnswers({ ...answers, [question.id]: event.target.value })}
          className="mt-4 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
        >
          <option value="">—</option>
          {question.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={question.id}
          type={question.type === 'date' ? 'date' : question.type === 'email' ? 'email' : 'text'}
          value={answer}
          disabled={!reserved}
          onChange={(event) => setAnswers({ ...answers, [question.id]: event.target.value })}
          className="mt-4 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
        />
      )}
      <button
        type="button"
        disabled={!reserved || !answer.trim()}
        onClick={() => {
          const blocked = question.blocks_application_when?.find((rule) =>
            isBlocking(rule, answer, answers, today)
          );
          if (blocked) {
            setValidationError(
              blocked.rule === 'age_under' ? labels.underage : labels.validationError
            );
            return;
          }
          setValidationError(null);
          if (step + 1 >= questions.length) complete();
          setStep(step + 1);
        }}
        className="mt-5 w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
      >
        {step + 1 >= questions.length ? labels.continue : labels.continue}
      </button>
      <p className="mt-2 min-h-5 text-sm text-red-700 dark:text-red-300" aria-live="polite">
        {validationError}
      </p>
    </div>
  );
}

function isBlocking(
  rule: NonNullable<Question['blocks_application_when']>[number],
  answer: string,
  answers: Record<string, string>,
  today: string
): boolean {
  if (rule.rule === 'answer_in') return rule.value.includes(answer);
  if (rule.rule === 'age_under') {
    const birthDate = answers.q_birth_date;
    if (!birthDate) return false;
    const birth = new Date(`${birthDate}T00:00:00Z`);
    const current = new Date(`${today}T00:00:00Z`);
    let age = current.getUTCFullYear() - birth.getUTCFullYear();
    if (
      current.getUTCMonth() < birth.getUTCMonth() ||
      (current.getUTCMonth() === birth.getUTCMonth() && current.getUTCDate() < birth.getUTCDate())
    ) {
      age -= 1;
    }
    return age < rule.value;
  }
  return false;
}

export function useLeaseApplicationContext() {
  const context = useContext(LeaseApplicationContext);
  if (!context) throw new Error('Lease application components must be rendered together');
  return context;
}
