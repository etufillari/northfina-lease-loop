'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Customer, Question } from '@/data/schemas';
import type { Locale } from '@/i18n/locales';

export type LeaseApplicationLabels = {
  reserve: string;
  reservationInfo: string;
  reservationError: string;
  questionStep: string;
  why: string;
  continue: string;
  complete: string;
  validationError: string;
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
  today: string;
};

const LeaseApplicationContext = createContext<LeaseApplicationContextValue | null>(null);

export function LeaseApplication({
  assetId,
  category,
  financedAmountCents,
  questions,
  labels,
  customer,
  today,
  children,
}: {
  assetId: string;
  category: string;
  financedAmountCents: number;
  questions: readonly Question[];
  labels: LeaseApplicationLabels;
  customer: Customer | null;
  today: string;
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
    if ('vat_registered' in customer) answers.q_vat_registered = String(customer.vat_registered);
    if ('applicant_can_sign' in customer) {
      answers.q_can_sign = String(customer.applicant_can_sign);
    }
    if ('annual_revenue_cents' in customer) {
      answers.q_annual_revenue = String(customer.annual_revenue_cents / 100);
    }
    return answers;
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  const visibleQuestions = useMemo(
    () =>
      questions.filter((question) =>
        question.ask_when.every((condition) => {
          const value = condition.field.startsWith('answers.')
            ? answers[condition.field.slice('answers.'.length)]
            : condition.field === 'category'
              ? category
              : condition.field === 'financed_amount_cents'
                ? financedAmountCents
                : answers.q_customer_type;
          if (condition.op === 'in') return condition.value.includes(String(value));
          if (condition.op === 'gte') return typeof value === 'number' && value >= condition.value;
          return typeof value === 'number' && value <= condition.value;
        })
      ),
    [answers, category, financedAmountCents, questions]
  );

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
        setAnswers,
        validationError,
        setValidationError,
        today,
      }}
    >
      {children}
    </LeaseApplicationContext.Provider>
  );
}

export function LeaseStartButton({ available }: { available: boolean }) {
  const { reserving, error, reserve, labels } = useLeaseApplicationContext();
  return (
    <div className="mt-8 border-t border-stone-200 pt-6 dark:border-stone-800">
      <button
        type="button"
        onClick={reserve}
        disabled={reserving || !available}
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
    today,
  } = useLeaseApplicationContext();
  const [step, setStep] = useState(0);
  const applicationRef = useRef<HTMLDivElement>(null);
  const question = questions[step];

  useEffect(() => {
    if (reserved) {
      applicationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      applicationRef.current?.focus();
    }
  }, [reserved]);

  if (!question) {
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
          if (
            question.blocks_application_when?.some((rule) =>
              isBlocking(rule, answer, answers, today)
            )
          ) {
            setValidationError(labels.validationError);
            return;
          }
          setValidationError(null);
          setStep(step + 1);
        }}
        className="mt-5 w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
      >
        {labels.continue}
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

function useLeaseApplicationContext() {
  const context = useContext(LeaseApplicationContext);
  if (!context) throw new Error('Lease application components must be rendered together');
  return context;
}
