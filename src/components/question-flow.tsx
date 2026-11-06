'use client';

// The application form, one question at a time. The engine (src/domain/question-flow) decides
// which question comes next; going back and changing an answer prunes the answers that no
// longer apply and says so. The server prunes and checks again on submit.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button, Card, Field, Notice, inputClasses } from '@/components/ui';
import type { Question } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import {
  answerProblem,
  birthDateRange,
  parseEurosToCents,
  type AnswerProblem,
  centsToEuroInput,
} from '@/domain/question-flow/answers';
import {
  nextQuestion,
  pruneAnswers,
  visibleQuestions,
  type Answer,
  type FlowContext,
} from '@/domain/question-flow/engine';
import { formatIsoDate } from '@/i18n/format';
import { intlLocale, type Locale } from '@/i18n/locales';

export type QuestionFlowLabels = {
  progress: string;
  why: string;
  next: string;
  back: string;
  change: string;
  review: string;
  submit: string;
  sending: string;
  error: string;
  required: string;
  invalid: string;
  /** Raw, with {earliest} and {latest}. */
  birthDateRange: string;
  signatoryIsApplicant: string;
  /** 403 NOT_APPLICANT: the actor is not the customer applying (D40). */
  notApplicant: string;
  /** 403 FORBIDDEN `signatory_required`: only the signing link signs (D46, D73). */
  notSignatory: string;
  /** Raw, with {question} and {problem}: the server refused one answer (400 with a `problem`). */
  answerRefused: string;
  pruned: string;
  moneyHint: string;
  listHint: string;
  /** The hint per validation format in the visitor's language; the pack's English is the fallback. */
  formatHints: Record<string, string>;
  prefill?: string;
};

type QuestionFlowProps = {
  locale: Locale;
  quoteId: string;
  customerId: string;
  /** The request's day (demo clock), for the birth-date range (D37). */
  today: string;
  bank: Question[];
  context: FlowContext;
  /** Question id → its text and "why we ask" in the page's language. */
  texts: Record<string, { text: string; why: string }>;
  /** Choice value → its label in the page's language. */
  options: Record<string, string>;
  labels: QuestionFlowLabels;
  /** The acting customer's details from the data pack, for a quick demo. */
  prefill?: Record<string, Answer>;
  /** The e-mail on the customer record: the applicant cannot name it as the signatory (D39). */
  applicantEmail?: string;
};

type FailureBody = {
  error?: {
    code?: string;
    details?: { questionId?: string; problem?: AnswerProblem; code?: string };
  };
};

const REVIEW = 'review';

export function QuestionFlow(props: QuestionFlowProps) {
  const { bank, context, labels, texts } = props;
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [cursor, setCursor] = useState<string>(() => nextQuestion(bank, context, {})?.id ?? REVIEW);
  const [removed, setRemoved] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [cursor]);

  const visible = visibleQuestions(bank, context, answers);
  const question = visible.find((q) => q.id === cursor) ?? null;

  function save(id: string, value: Answer) {
    const updated = pruneAnswers(bank, context, { ...answers, [id]: value });
    const dropped = Object.keys(answers).filter((key) => !(key in updated));
    setRemoved(dropped);
    setAnswers(updated);
    setCursor(nextQuestion(bank, context, updated)?.id ?? REVIEW);
  }

  function back() {
    const index = cursor === REVIEW ? visible.length : visible.findIndex((q) => q.id === cursor);
    const previous = visible[index - 1];
    if (previous) {
      setRemoved([]);
      setCursor(previous.id);
    }
  }

  function applyPrefill() {
    if (!props.prefill) return;
    const filled = pruneAnswers(bank, context, props.prefill);
    setRemoved([]);
    setAnswers(filled);
    setCursor(nextQuestion(bank, context, filled)?.id ?? REVIEW);
  }

  /** The sentence for a refused submit: the code the server sent, else the generic error. */
  function failureText(body: FailureBody): string {
    const code = body.error?.code;
    if (code === 'FORBIDDEN' && body.error?.details?.code === 'signatory_required') {
      return labels.notSignatory;
    }
    if (code === 'NOT_APPLICANT' || code === 'FORBIDDEN') return labels.notApplicant;
    // D90: a pass-on's quote held for another customer (the page refuses it up front too).
    if (code === 'QUOTE_RESERVED_FOR_ANOTHER_CUSTOMER') return labels.notApplicant;
    const { questionId, problem } = body.error?.details ?? {};
    if (problem && questionId) {
      return labels.answerRefused
        .replace('{question}', texts[questionId]?.text ?? questionId)
        .replace('{problem}', problemText(problem, labels, props.locale));
    }
    return labels.error;
  }

  async function submit() {
    setSending(true);
    setFailed(null);
    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quoteId: props.quoteId, customerId: props.customerId, answers }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as FailureBody;
        setFailed(failureText(body));
        setSending(false);
        return;
      }
      const body = (await response.json()) as { data: { id: string } };
      router.push(`/${props.locale}/applications/${body.data.id}`);
    } catch {
      setFailed(labels.error);
      setSending(false);
    }
  }

  const display = (q: Question, answer: Answer | undefined): string => {
    if (answer === undefined) return '';
    if (Array.isArray(answer)) return answer.join(', ');
    if (q.type === 'choice') return props.options[answer as string] ?? String(answer);
    if (q.type === 'money') return formatEuro(Number(answer), intlLocale[props.locale]);
    if (q.type === 'date') return formatIsoDate(answer as string, props.locale);
    return String(answer);
  };

  const position = question ? visible.indexOf(question) + 1 : visible.length;

  return (
    <div className="space-y-6">
      {removed.length > 0 ? (
        <Notice tone="info" live>
          {labels.pruned
            .replace('{count}', String(removed.length))
            .replace('{questions}', removed.map((id) => texts[id]?.text ?? id).join(', '))}
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted" aria-live="polite">
          {labels.progress
            .replace('{current}', String(position))
            .replace('{total}', String(visible.length))}
        </p>
        {props.prefill && labels.prefill && Object.keys(answers).length === 0 ? (
          <Button variant="secondary" size="sm" onClick={applyPrefill}>
            {labels.prefill}
          </Button>
        ) : null}
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={visible.length}
        aria-valuenow={position}
      >
        <div
          className="h-full bg-brand transition-all"
          style={{ width: `${(100 * position) / Math.max(visible.length, 1)}%` }}
        />
      </div>

      {question ? (
        <QuestionStep
          key={question.id}
          question={question}
          text={texts[question.id]}
          options={props.options}
          initial={answers[question.id]}
          answers={answers}
          applicantEmail={props.applicantEmail}
          today={props.today}
          locale={props.locale}
          labels={labels}
          headingRef={headingRef}
          canGoBack={position > 1}
          onBack={back}
          onSave={(value) => save(question.id, value)}
        />
      ) : (
        <Card as="section">
          <h2 ref={headingRef} tabIndex={-1} className="mb-2 text-xl font-semibold outline-none">
            {labels.review}
          </h2>
          <dl className="divide-y divide-line">
            {visible.map((q) => (
              <div key={q.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                <div className="min-w-0">
                  <dt className="text-sm text-ink-muted">{texts[q.id]?.text ?? q.id}</dt>
                  <dd className="font-medium break-words">{display(q, answers[q.id])}</dd>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCursor(q.id)}
                  aria-label={`${labels.change}: ${texts[q.id]?.text ?? q.id}`}
                >
                  {labels.change}
                </Button>
              </div>
            ))}
          </dl>
          {failed ? (
            <Notice tone="error" live className="mt-4">
              {failed}
            </Notice>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={back}>
              {labels.back}
            </Button>
            <Button onClick={submit} pending={sending} pendingLabel={labels.sending}>
              {labels.submit}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

/** The sentence for an answer the flow cannot take (team rule 6: the domain gives the code). */
function problemText(problem: AnswerProblem, labels: QuestionFlowLabels, locale: Locale): string {
  switch (problem.code) {
    case 'birth_date_out_of_range':
      return labels.birthDateRange
        .replace('{earliest}', formatIsoDate(problem.params.earliest, locale))
        .replace('{latest}', formatIsoDate(problem.params.latest, locale));
    case 'signatory_is_applicant':
      return labels.signatoryIsApplicant;
    case 'invalid':
      return labels.invalid;
  }
}

type StepProps = {
  question: Question;
  text: { text: string; why: string } | undefined;
  options: Record<string, string>;
  initial: Answer | undefined;
  /** The other answers so far, for the checks across answers (D39). */
  answers: Record<string, Answer>;
  applicantEmail?: string;
  today: string;
  locale: Locale;
  labels: QuestionFlowLabels;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  canGoBack: boolean;
  onBack: () => void;
  onSave: (value: Answer) => void;
};

function QuestionStep(props: StepProps) {
  const { question, text, options, initial, labels, headingRef, canGoBack, onBack, onSave } = props;
  const initialDraft =
    initial === undefined
      ? ''
      : Array.isArray(initial)
        ? initial.join('\n')
        : question.type === 'money'
          ? centsToEuroInput(Number(initial), props.locale === 'en' ? '.' : ',')
          : String(initial);
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState<string | null>(null);
  const id = `question-${question.id}`;
  const range = birthDateRange(props.today);
  const title = text?.text ?? question.id;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (draft.trim() === '') return setError(labels.required);
    let value: Answer = draft.trim();
    if (question.type === 'money') {
      const cents = parseEurosToCents(draft);
      if (cents === null) return setError(labels.invalid);
      value = String(cents);
    }
    if (question.type === 'list') {
      value = draft
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    }
    const problem = answerProblem(question, value, {
      today: props.today,
      answers: props.answers,
      applicantEmail: props.applicantEmail,
    });
    if (problem) return setError(problemText(problem, labels, props.locale));
    onSave(value);
  }

  // Teal, narrow and with a chevron, so it reads as a note to open and not as one more option.
  const why = (
    <details className="group w-full max-w-prose sm:w-fit rounded-lg border border-info-line bg-info-soft text-sm text-info-ink">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-semibold [&::-webkit-details-marker]:hidden">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
        {labels.why}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-4 shrink-0 transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <p className="px-3 pb-3">{text?.why}</p>
    </details>
  );

  return (
    <Card as="section">
      <form onSubmit={submit} noValidate className="space-y-5">
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
          {title}
        </h2>
        {question.type === 'choice' ? (
          <fieldset aria-describedby={error ? `${id}-error` : undefined}>
            <legend className="sr-only">{title}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {question.options?.map((option) => (
                <label
                  key={option}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line px-3 py-2 has-checked:border-brand has-checked:bg-muted"
                >
                  <input
                    type="radio"
                    name={id}
                    value={option}
                    checked={draft === option}
                    onChange={() => {
                      setDraft(option);
                      setError(null);
                    }}
                    className="size-4"
                  />
                  <span>{options[option] ?? option}</span>
                </label>
              ))}
            </div>
            {error ? (
              <p id={`${id}-error`} className="mt-2 text-sm font-medium text-danger-ink">
                {error}
              </p>
            ) : null}
          </fieldset>
        ) : (
          <Field
            id={id}
            label={<span className="sr-only">{title}</span>}
            hint={
              question.type === 'money'
                ? labels.moneyHint
                : question.type === 'list'
                  ? labels.listHint
                  : question.validation
                    ? (labels.formatHints[question.validation.format] ?? question.validation.hint)
                    : undefined
            }
            error={error}
          >
            {(control) =>
              question.type === 'list' ? (
                <textarea
                  {...control}
                  rows={4}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className={inputClasses}
                />
              ) : (
                <input
                  {...control}
                  type={
                    question.type === 'email' ? 'email' : question.type === 'date' ? 'date' : 'text'
                  }
                  inputMode={question.type === 'money' ? 'decimal' : undefined}
                  autoComplete={question.type === 'email' ? 'email' : undefined}
                  {...(question.id === 'q_birth_date'
                    ? { min: range.earliest, max: range.latest }
                    : {})}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className={inputClasses}
                />
              )
            }
          </Field>
        )}
        {why}
        <div className="flex flex-wrap gap-3">
          {canGoBack ? (
            <Button variant="secondary" onClick={onBack}>
              {labels.back}
            </Button>
          ) : null}
          <Button type="submit">{labels.next}</Button>
        </div>
      </form>
    </Card>
  );
}
