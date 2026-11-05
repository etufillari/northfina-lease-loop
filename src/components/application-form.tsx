'use client';

// The application (Smart Problem 4): only the questions that apply to this deal, each with why
// we ask, and the decision with its reasons. Runs the domain rules live in the browser; the
// server decides again when signing (D-018). Answers to questions that stop applying are set
// aside: never shown, sent or decided on, and restored if the question comes back (D-022).
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { Question, VatRates } from '@/data/schemas';
import { decideApplication, type Decision, type DecisionReason } from '@/domain/eligibility';
import { invoiceSchedule } from '@/domain/invoicing';
import { formatEuro, parseEuros } from '@/domain/money';
import {
  askedQuestions,
  relevantAnswers,
  validateAnswer,
  type AnswerValue,
  type Answers,
  type Deal,
} from '@/domain/question-flow';
import { formatIsoDate } from '@/i18n/format';
import { getT, messages, type MessageKey, type Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export type Persona = { id: string; name: string; answers: Answers };

export type ApplicationFormProps = {
  locale: Locale;
  questions: Question[];
  personas: Persona[];
  vatRates: VatRates;
  today: string;
  assetId: string;
  deal: Deal;
  downPaymentCents: number;
  monthlyNetRentCents: number;
};

/** What the person typed, per question id. Turned into answers by `toAnswers`. */
type Drafts = Record<string, string>;
/** `mismatch`: the server found answers that contradict the chosen customer's record. */
type Signing = 'idle' | 'busy' | 'error' | 'mismatch';

export function ApplicationForm(props: ApplicationFormProps) {
  const { locale, questions, deal } = props;
  const t = getT(locale);
  const router = useRouter();
  const [drafts, setDrafts] = useState<Drafts>({});
  const [personaId, setPersonaId] = useState('');
  // Answers the person has seen on screen; only those get the "set aside" note when dropped.
  const [shown, setShown] = useState<readonly string[]>([]);
  const [signing, setSigning] = useState<Signing>('idle');
  const personaFieldId = useId();
  // A persona's answers are facts on its record; the server refuses anything else (D-031).
  const persona = props.personas.find((p) => p.id === personaId);

  const all = toAnswers(questions, drafts);
  const { answers, dropped } = relevantAnswers(questions, deal, all);
  const asked = askedQuestions(questions, deal, answers);
  const schedule = invoiceSchedule(
    {
      startDate: props.today,
      termMonths: deal.termMonths,
      monthlyNetRentCents: props.monthlyNetRentCents,
      billing: 'start_day_full_months',
    },
    props.vatRates
  );
  const decision: Decision = decideApplication(questions, {
    deal,
    answers,
    startDate: props.today,
    highestMonthlyGrossCents: schedule.ok
      ? Math.max(...schedule.invoices.map((i) => i.grossCents))
      : 0,
  });

  function choosePersona(id: string) {
    setPersonaId(id);
    setSigning('idle');
    const persona = props.personas.find((p) => p.id === id);
    const filled = persona ? toDrafts(persona.answers) : {};
    setDrafts(filled);
    const visible = askedQuestions(questions, deal, persona?.answers ?? {}).map((q) => q.id);
    setShown(visible.filter((id) => filled[id] !== undefined));
  }

  function answer(id: string, text: string) {
    setDrafts((current) => ({ ...current, [id]: text }));
    setShown((current) => (current.includes(id) ? current : [...current, id]));
  }

  async function sign() {
    setSigning('busy');
    const response = await fetch('/api/contracts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        assetId: props.assetId,
        ...(personaId ? { customerId: personaId } : {}),
        termMonths: deal.termMonths,
        downPaymentCents: props.downPaymentCents,
        answers,
      }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      success: boolean;
      data?: { id: number };
      error?: { code: string };
    } | null;
    if (body?.success && body.data) {
      router.push(`/${locale}/contracts/${body.data.id}`);
      return;
    }
    setSigning(body?.error?.code === 'ANSWERS_DO_NOT_MATCH_CUSTOMER' ? 'mismatch' : 'error');
  }

  return (
    <section aria-labelledby="application" className="mt-12">
      <h2 id="application" className="font-display text-2xl font-bold tracking-tight">
        {t('application.title')}
      </h2>
      <p className="mt-1 text-muted">{t('application.intro')}</p>

      <div className="mt-6 max-w-md">
        <label htmlFor={personaFieldId} className="eyebrow">
          {t('application.persona')}
        </label>
        <select
          id={personaFieldId}
          value={personaId}
          onChange={(event) => choosePersona(event.target.value)}
          className="field mt-2"
        >
          <option value="">{t('application.personaNone')}</option>
          {props.personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_24rem] lg:gap-12">
        <div className="space-y-6">
          {asked.map((question) => (
            <QuestionField
              key={question.id}
              question={question}
              locale={locale}
              t={t}
              draft={drafts[question.id] ?? ''}
              answer={answers[question.id]}
              fromRecord={persona?.answers[question.id] !== undefined}
              onChange={(text) => answer(question.id, text)}
            />
          ))}
          {dropped.some((id) => shown.includes(id)) ? (
            <p role="status" className="text-sm text-muted">
              {t('application.dropped')}
            </p>
          ) : null}
        </div>

        <DecisionPanel
          decision={decision}
          locale={locale}
          t={t}
          signing={signing}
          onSign={() => void sign()}
        />
      </div>
    </section>
  );
}

function QuestionField(props: {
  question: Question;
  locale: Locale;
  t: Translate;
  draft: string;
  answer: AnswerValue | undefined;
  /** The chosen customer's record answers this one: shown, but not editable. */
  fromRecord: boolean;
  onChange: (text: string) => void;
}) {
  const { question, locale, t, draft, fromRecord } = props;
  const id = useId();
  const check = props.answer === undefined ? null : validateAnswer(question, props.answer);
  const error = check && !check.ok ? t(`error.${check.reason}`) : null;
  const describedBy = [`${id}-why`, fromRecord && `${id}-record`, error && `${id}-error`]
    .filter(Boolean)
    .join(' ');
  const field = 'field mt-2';
  const common = {
    id,
    'aria-describedby': describedBy,
    'aria-invalid': error !== null,
    className: field,
  };

  let input;
  if (question.options) {
    input = (
      <select
        {...common}
        disabled={fromRecord}
        value={draft}
        onChange={(e) => props.onChange(e.target.value)}
      >
        <option value="">{t('application.choose')}</option>
        {question.options.map((option) => (
          <option key={option} value={option}>
            {optionLabel(question.id, option, t)}
          </option>
        ))}
      </select>
    );
  } else if (question.type === 'list') {
    input = (
      <textarea
        {...common}
        readOnly={fromRecord}
        rows={3}
        value={draft}
        placeholder={t('application.listHint')}
        onChange={(e) => props.onChange(e.target.value)}
      />
    );
  } else {
    const type = question.type === 'date' ? 'date' : question.type === 'email' ? 'email' : 'text';
    input = (
      <input
        {...common}
        readOnly={fromRecord}
        type={type}
        inputMode={question.type === 'money' ? 'decimal' : undefined}
        placeholder={question.type === 'money' ? t('application.moneyHint') : undefined}
        value={draft}
        onChange={(e) => props.onChange(e.target.value)}
      />
    );
  }

  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {question.text[locale]}
      </label>
      {input}
      <p id={`${id}-why`} className="mt-1 text-xs text-muted">
        <span className="font-medium">{t('application.why')}:</span>{' '}
        {translated(`why.${question.id}`, t) ?? question.why_we_ask.en}
      </p>
      {fromRecord ? (
        <p id={`${id}-record`} className="mt-1 text-xs text-muted">
          {t('application.fromRecord')}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function DecisionPanel(props: {
  decision: Decision;
  locale: Locale;
  t: Translate;
  signing: Signing;
  onSign: () => void;
}) {
  const { decision, locale, t } = props;
  const canSign =
    decision.status === 'decided' &&
    decision.outcome === 'approved' &&
    decision.signer.kind === 'applicant';

  return (
    <aside
      aria-live="polite"
      className="panel h-fit p-6 shadow-xl shadow-black/5 lg:sticky lg:top-24"
    >
      <h3 className="eyebrow">{t('application.decision')}</h3>
      {decision.status !== 'decided' ? (
        <p className="mt-2 text-sm">{t('application.remaining')}</p>
      ) : (
        <>
          <p className="mt-2 font-display text-2xl font-bold">{t(`outcome.${decision.outcome}`)}</p>
          {decision.outcome === 'approved' && decision.signer.kind === 'applicant' ? (
            <p className="mt-2 text-sm">{t('outcome.approved.text')}</p>
          ) : null}
          {decision.outcome === 'manual_review' ? (
            <p className="mt-2 text-sm">{t('outcome.manual_review.text')}</p>
          ) : null}
          {decision.signer.kind === 'signatory' && decision.outcome === 'approved' ? (
            <p className="mt-2 text-sm">
              {t('signer.signatory', { email: decision.signer.email })}
            </p>
          ) : null}
          {decision.reasons.length > 0 ? (
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
              {decision.reasons.map((reason, i) => (
                <li key={i}>{reasonText(reason, locale, t)}</li>
              ))}
            </ul>
          ) : null}
        </>
      )}

      <button
        type="button"
        onClick={props.onSign}
        disabled={!canSign || props.signing === 'busy'}
        className="btn-primary mt-6 w-full py-3.5"
      >
        {props.signing === 'busy' ? t('lease.signing') : t('lease.sign')}
      </button>
      <p className="mt-2 text-xs text-muted">{t('lease.signNote')}</p>
      {props.signing === 'error' || props.signing === 'mismatch' ? (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {t(props.signing === 'mismatch' ? 'lease.errorRecord' : 'lease.error')}
        </p>
      ) : null}
    </aside>
  );
}

function reasonText(reason: DecisionReason, locale: Locale, t: Translate): string {
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  switch (reason.rule) {
    case 'min_age':
      return t('reason.min_age', {
        minAge: reason.minAge,
        date: formatIsoDate(reason.eligibleFrom, locale),
      });
    case 'blocked_answer':
      return translated(`reason.blocked_answer.${reason.questionId}`, t) ?? reason.questionId;
    case 'affordability':
      return t('reason.affordability', {
        rent: euro(reason.monthlyGrossCents),
        max: euro(reason.maxMonthlyGrossCents),
      });
    case 'pep_manual_review':
      return t('reason.pep_manual_review');
  }
}

/** Typed form drafts → answers. Money is parsed to cents; an empty draft is no answer. */
function toAnswers(questions: readonly Question[], drafts: Drafts): Answers {
  const types = new Map(questions.map((q) => [q.id, q.type]));
  const answers: Record<string, AnswerValue> = {};
  for (const [id, text] of Object.entries(drafts)) {
    if (text.trim() === '') continue;
    const type = types.get(id);
    if (type === 'money') answers[id] = parseEuros(text) ?? text;
    else if (type === 'list') answers[id] = text.split('\n');
    else answers[id] = text;
  }
  return answers;
}

/** A persona's answers → what the form fields show. */
function toDrafts(answers: Answers): Drafts {
  const drafts: Drafts = {};
  for (const [id, value] of Object.entries(answers)) {
    // Integer maths only: 320050 → "3200.50".
    if (typeof value === 'number') {
      drafts[id] = `${Math.trunc(value / 100)}.${String(value % 100).padStart(2, '0')}`;
    } else if (typeof value === 'string') drafts[id] = value;
    else drafts[id] = value.join('\n');
  }
  return drafts;
}

function optionLabel(questionId: string, option: string, t: Translate): string {
  return (
    translated(`option.${questionId}.${option}`, t) ?? translated(`option.${option}`, t) ?? option
  );
}

/** Translates a key built at runtime, or returns null when no message has it. */
function translated(key: string, t: Translate): string | null {
  return key in messages.en ? t(key as MessageKey) : null;
}
