'use client';
// The smart question flow, one question at a time, with the lease summary alongside.
// Everything comes from the API state: which questions apply, which is next, what can be
// prefilled. Editing an earlier answer re-runs the flow server-side, and answers that stop
// applying are dropped there. The browser's Back button steps back one question instead of
// leaving the page.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  AnsweredList,
  optionLabel,
  QuestionInput,
  type Question,
} from '@/components/application-questions';
import { ApplicationSummary, type SummaryQuote } from '@/components/application-summary';
import {
  DecisionScreen,
  type DecisionReason,
  type DecisionStatus,
} from '@/components/decision-screen';
import { addMonthsClamped } from '@/domain/calendar';
import { MAX_START_MONTHS_AHEAD } from '@/domain/contract';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { isSentinel, previousAnswered } from './wizard-back';
import { DateField } from './date-field';

type WizardState = {
  application: {
    id: string;
    status: string;
    answers: Record<string, unknown>;
    decisionReasons: DecisionReason[] | null;
    signatoryEmail: string | null;
    holdUntil: string | null;
    startDate: string | null;
    isTransfer: boolean;
  };
  quote: SummaryQuote;
  visibleQuestions: Question[];
  nextQuestionId: string | null;
  prefill: Record<string, unknown>;
  blocked: { questionId: string; rule: string; eligibleFrom?: string } | null;
};

// Basics are confirmed as one batch; income, employment, PEP and signing rights are each
// confirmed on their own (docs/DECISIONS.md: sensitive answers may be stale).
const BASIC_PREFILL = new Set([
  'q_customer_type',
  'q_full_name',
  'q_birth_date',
  'q_email',
  'q_country',
  'q_company_name',
  'q_business_id',
  'q_vat_registered',
]);

export function ApplicationWizard({
  locale,
  applicationId,
  personaId,
  asOf,
  today,
}: {
  locale: Locale;
  applicationId: string;
  personaId: string | null;
  asOf: string | null;
  today: string;
}) {
  const t = getT(locale);
  const router = useRouter();
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const suffix = asOf ? `?asOf=${asOf}` : '';
  // Conflicts a customer can actually run into get a translated text; anything else falls
  // back to the API's own message.
  const apiError = (error: { code?: string; message?: string } | undefined) => {
    const known: Record<string, MessageKey> = {
      ASSET_UNAVAILABLE: 'apply.error.assetUnavailable',
      TRANSFER_CLOSED: 'apply.error.transferClosed',
    };
    const key = error?.code ? known[error.code] : undefined;
    return key ? t(key) : (error?.message ?? t('common.error'));
  };
  const maxStartDate = addMonthsClamped(today, MAX_START_MONTHS_AHEAD);

  const [state, setState] = useState<WizardState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  // Why the last answer was refused (the server checks every answer's shape).
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(asOf ?? today);
  const [saveDefaults, setSaveDefaults] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/applications/${applicationId}${suffix}`)
      .then((response) => response.json())
      .then((body) => {
        if (cancelled) return;
        if (body.success) setState(body.data);
        else setError(body.error?.message ?? 'Not found');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [applicationId, suffix]);

  // The browser's Back button steps back one question while the form runs, instead of
  // leaving the page. A sentinel history entry (same URL, marked `leaseWizard`) exists only
  // while there IS a question to step back to, so on a decided application or the first
  // question Back leaves at once. If the sentinel outlives that (the form was submitted),
  // the Back that pops it leaves too, rather than doing nothing.
  const sentinelActive = useRef(false);
  const stepBackRef = useRef<() => boolean>(() => false);
  const browserBackSteps =
    state !== null &&
    state.application.status === 'draft' &&
    previousAnswered(state, editingId) !== null;
  useEffect(() => {
    // Arriving on a sentinel from another page (Back from the contract) counts as active.
    sentinelActive.current = isSentinel(window.history.state);
    const onPop = () => {
      if (isSentinel(window.history.state)) {
        sentinelActive.current = true; // Forward onto a sentinel: nothing to undo.
        return;
      }
      if (!sentinelActive.current) return; // Ordinary navigation, not ours.
      sentinelActive.current = false;
      if (!stepBackRef.current()) window.history.back();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (browserBackSteps && !sentinelActive.current) {
      window.history.pushState({ leaseWizard: true }, '');
      sentinelActive.current = true;
    }
  });
  useEffect(() => {
    stepBackRef.current = () => {
      if (!state || state.application.status !== 'draft') return false;
      const previous = previousAnswered(state, editingId);
      if (!previous) return false;
      setEditingId(previous.id);
      setDraft(String(state.application.answers[previous.id] ?? ''));
      return true;
    };
  }, [state, editingId]);

  if (!state) return <p>{error ?? t('common.loading')}</p>;

  const { application, visibleQuestions, nextQuestionId, prefill, blocked } = state;
  const currentId = editingId ?? nextQuestionId;
  const current = visibleQuestions.find((q) => q.id === currentId) ?? null;
  const answered = visibleQuestions.filter(
    (q) => application.answers[q.id] !== undefined && q.id !== currentId
  );

  function editQuestion(id: string) {
    setEditingId(id);
    setDraft(String(state?.application.answers[id] ?? ''));
  }

  async function send(questionId: string, answer: unknown) {
    setBusy(true);
    const response = await fetch(`/api/applications/${applicationId}/answers${suffix}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ questionId, answer }),
    });
    const body = await response.json();
    setBusy(false);
    if (body.success) {
      setState(body.data);
      setWarning(body.data.warning);
      setAnswerError(null);
      setEditingId(null);
      setDraft('');
    } else {
      // Never fail silently: say why the answer was not taken.
      setAnswerError(body.error?.message ?? t('common.error'));
    }
  }

  async function confirmBasics(items: Array<{ id: string; value: unknown }>) {
    setBusy(true);
    let latest: WizardState | null = null;
    for (const item of items) {
      const response = await fetch(`/api/applications/${applicationId}/answers${suffix}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ questionId: item.id, answer: item.value }),
      });
      const body = await response.json();
      if (!body.success) {
        setAnswerError(body.error?.message ?? t('common.error'));
        break;
      }
      latest = body.data;
    }
    setBusy(false);
    if (latest) setState(latest);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    if (saveDefaults && personaId) {
      await fetch(`/api/customers/${personaId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ defaults: application.answers }),
      });
    }
    const response = await fetch(`/api/applications/${applicationId}/submit${suffix}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ startDate }),
    });
    const body = await response.json();
    setBusy(false);
    if (body.success) setState(body.data);
    else setError(apiError(body.error));
  }

  async function sign() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/applications/${applicationId}/sign${suffix}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ startDate: application.startDate ?? startDate }),
    });
    const body = await response.json();
    setBusy(false);
    if (!body.success) {
      // Never a dead button: say what the API objected to (e.g. a start date now in the past).
      setError(apiError(body.error));
      return;
    }
    router.push(`/${locale}/contracts/${body.data.contractId}${suffix}`);
  }

  // Cancelling frees the items at once: no life is added, the asset was never used.
  async function cancel() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/applications/${applicationId}/cancel${suffix}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await response.json();
    setBusy(false);
    if (body.success) setState(body.data);
    else setError(apiError(body.error));
  }

  // ---- decision screen: the summary moves to the middle of the page ----------------
  if (application.status !== 'draft') {
    return (
      <div className="mx-auto max-w-2xl">
        <DecisionScreen
          locale={locale}
          suffix={suffix}
          status={application.status as DecisionStatus}
          holdUntil={application.holdUntil}
          signatoryEmail={application.signatoryEmail}
          reasons={application.decisionReasons}
          startDate={application.startDate}
          error={error}
          busy={busy}
          onSign={sign}
          onCancel={cancel}
          isTransfer={application.isTransfer}
          summary={
            <ApplicationSummary
              locale={locale}
              quote={state.quote}
              startDate={application.isTransfer ? null : application.startDate}
            />
          }
        />
      </div>
    );
  }

  // ---- blocked (age / country): the form stops kindly ------------------------------
  if (blocked && !editingId) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold">{t('apply.title')}</h1>
        <p className="mt-4 rounded-xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200 ring-inset dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800">
          {blocked.rule === 'age_under'
            ? t('apply.blockedAge', {
                date: blocked.eligibleFrom ? formatIsoDate(blocked.eligibleFrom, locale) : '',
              })
            : t('apply.blockedCountry')}
        </p>
        <AnsweredList
          t={t}
          locale={locale}
          answered={answered}
          answers={application.answers}
          onEdit={editQuestion}
        />
      </div>
    );
  }

  // ---- the running form, with the summary at its side -------------------------------
  const batchItems = visibleQuestions
    .filter(
      (q) =>
        application.answers[q.id] === undefined &&
        prefill[q.id] !== undefined &&
        BASIC_PREFILL.has(q.id)
    )
    .map((q) => ({ question: q, value: prefill[q.id]! }));
  const showBatch =
    current !== null && !editingId && batchItems.some((item) => item.question.id === current.id);
  const canStepBack = application.status === 'draft' && previousAnswered(state, editingId) !== null;

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">{t('apply.title')}</h1>
          {canStepBack ? (
            <button
              type="button"
              onClick={() => stepBackRef.current()}
              className="text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300"
            >
              ← {t('apply.back')}
            </button>
          ) : null}
        </div>

        {showBatch ? (
          <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-800 dark:bg-emerald-950/40">
            <h2 className="text-lg font-medium">{t('apply.prefillBasics')}</h2>
            <ul className="mt-3 divide-y divide-emerald-100 text-sm dark:divide-emerald-900">
              {batchItems.map(({ question, value }) => (
                <li key={question.id} className="flex items-baseline justify-between gap-4 py-2">
                  <span className="text-stone-600 dark:text-stone-400">
                    {question.text[locale] ?? question.text.en}
                  </span>
                  <span className="flex items-baseline gap-3">
                    <span className="font-medium">
                      {question.type === 'choice'
                        ? optionLabel(t, String(value))
                        : question.type === 'date'
                          ? formatIsoDate(String(value), locale)
                          : Array.isArray(value)
                            ? value.join(', ')
                            : String(value)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(question.id);
                        setDraft(String(value ?? ''));
                      }}
                      className="text-emerald-800 hover:underline dark:text-emerald-300"
                    >
                      {t('apply.edit')}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                confirmBasics(batchItems.map(({ question, value }) => ({ id: question.id, value })))
              }
              className="mt-4 rounded-xl bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {t('apply.confirmAll')}
            </button>
          </section>
        ) : null}
        {showBatch && answerError ? (
          <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
            {answerError}
          </p>
        ) : null}

        {current && !showBatch ? (
          <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
            <h2 className="text-lg font-medium">{current.text[locale] ?? current.text.en}</h2>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              <span className="font-medium">{t('apply.whyWeAsk')}:</span>{' '}
              {current.why_we_ask[locale as 'en'] ?? current.why_we_ask.en}
            </p>

            {prefill[current.id] !== undefined && draft === '' ? (
              <div className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm ring-1 ring-emerald-200 ring-inset dark:bg-emerald-950 dark:ring-emerald-800">
                <p className="font-medium">{t('apply.prefillBasics')}</p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span>
                    {current.type === 'choice'
                      ? optionLabel(t, String(prefill[current.id]))
                      : current.type === 'money'
                        ? euro(Number(prefill[current.id]))
                        : String(prefill[current.id])}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => send(current.id, prefill[current.id])}
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 font-medium text-white hover:bg-emerald-800"
                  >
                    {t('apply.confirm')}
                  </button>
                </div>
              </div>
            ) : null}

            <QuestionInput
              locale={locale}
              key={current.id}
              t={t}
              question={current}
              draft={draft}
              setDraft={setDraft}
              busy={busy}
              onSubmit={(value) => send(current.id, value)}
            />
            {warning ? (
              <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
                {t('apply.businessIdWarning')}
              </p>
            ) : null}
            {answerError ? (
              <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
                {answerError}
              </p>
            ) : null}
          </section>
        ) : null}

        {!current && !showBatch ? (
          <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
            <label htmlFor="start" className="block text-sm font-medium">
              {t('apply.startDate')}
            </label>
            <div className="mt-1 max-w-xs">
              <DateField
                locale={locale}
                id="start"
                value={startDate}
                min={today}
                max={maxStartDate}
                onChange={setStartDate}
                className="rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
              />
            </div>
            <p className="mt-1 text-xs text-stone-500">{t('apply.startDateHint')}</p>
            {personaId ? (
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={saveDefaults}
                  onChange={(event) => setSaveDefaults(event.target.checked)}
                  className="accent-emerald-700"
                />
                {t('apply.saveDefaults')}
              </label>
            ) : null}
            <button
              type="button"
              onClick={submit}
              disabled={busy || !startDate}
              className="mt-5 w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {t('apply.submit')}
            </button>
            {error ? (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200 ring-inset dark:bg-red-950 dark:text-red-200 dark:ring-red-800">
                {error}
              </p>
            ) : null}
          </section>
        ) : null}

        <AnsweredList
          t={t}
          locale={locale}
          answered={answered}
          answers={application.answers}
          onEdit={editQuestion}
        />
      </div>

      <aside className="h-fit lg:sticky lg:top-6">
        <ApplicationSummary locale={locale} quote={state.quote} startDate={null} />
      </aside>
    </div>
  );
}
