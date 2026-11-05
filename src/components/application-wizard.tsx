'use client';
// The smart question flow, one question at a time. Everything comes from the API state:
// which questions apply, which is next, what can be prefilled. Editing an earlier answer
// re-runs the flow server-side, and answers that stop applying are dropped there.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatEuro } from '@/domain/money';
import { getT, type MessageKey, type Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

type QuestionText = { en: string; fi?: string; sv?: string; et?: string };
type Question = {
  id: string;
  type: 'choice' | 'text' | 'date' | 'email' | 'money' | 'list';
  text: Record<string, string>;
  why_we_ask: QuestionText;
  options?: string[];
};
type Reason = { rule: string; outcome: string; params?: Record<string, string | number> };
type WizardState = {
  application: {
    id: string;
    status: string;
    answers: Record<string, unknown>;
    decisionReasons: Reason[] | null;
    signatoryEmail: string | null;
    holdUntil: string | null;
  };
  quote: { assetId: string; monthlyNetRentCents: number; termMonths: number };
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

const OPTION_KEYS = new Set([
  'consumer',
  'sole_trader',
  'company',
  'employed',
  'self_employed',
  'student',
  'retired',
  'unemployed',
  'yes',
  'no',
  'FI',
  'SE',
  'EE',
  'other',
  'commuting',
  'leisure',
  'delivery',
]);

function optionLabel(t: Translate, option: string): string {
  return OPTION_KEYS.has(option) ? t(`option.${option}` as MessageKey) : option;
}

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
  const actor = personaId ?? 'anonymous';

  const [state, setState] = useState<WizardState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(asOf ?? today);
  const [saveDefaults, setSaveDefaults] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/applications/${applicationId}${suffix}`)
      .then((response) => response.json())
      .then((body) => {
        if (!cancelled && body.success) setState(body.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [applicationId, suffix]);

  if (!state) return <p>{t('common.loading')}</p>;

  const { application, visibleQuestions, nextQuestionId, prefill, blocked } = state;
  const currentId = editingId ?? nextQuestionId;
  const current = visibleQuestions.find((q) => q.id === currentId) ?? null;
  const answered = visibleQuestions.filter(
    (q) => application.answers[q.id] !== undefined && q.id !== currentId
  );

  async function send(questionId: string, answer: unknown) {
    setBusy(true);
    const response = await fetch(`/api/applications/${applicationId}/answers${suffix}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ questionId, answer, actor }),
    });
    const body = await response.json();
    setBusy(false);
    if (body.success) {
      setState(body.data);
      setWarning(body.data.warning);
      setEditingId(null);
      setDraft('');
    }
  }

  async function confirmBasics(items: Array<{ id: string; value: unknown }>) {
    setBusy(true);
    let latest: WizardState | null = null;
    for (const item of items) {
      const response = await fetch(`/api/applications/${applicationId}/answers${suffix}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ questionId: item.id, answer: item.value, actor }),
      });
      const body = await response.json();
      if (!body.success) break;
      latest = body.data;
    }
    setBusy(false);
    if (latest) setState(latest);
  }

  async function submit() {
    setBusy(true);
    if (saveDefaults && personaId) {
      await fetch(`/api/customers/${personaId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ defaults: application.answers, actor }),
      });
    }
    const response = await fetch(`/api/applications/${applicationId}/submit${suffix}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ startDate, actor }),
    });
    const body = await response.json();
    setBusy(false);
    if (body.success) setState(body.data);
  }

  async function sign() {
    setBusy(true);
    const response = await fetch(`/api/applications/${applicationId}/sign${suffix}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ startDate, actor }),
    });
    const body = await response.json();
    setBusy(false);
    if (body.success) router.push(`/${locale}/contracts/${body.data.contractId}${suffix}`);
  }

  // ---- decision screen -------------------------------------------------------------
  if (application.status !== 'draft') {
    const status = application.status as
      'approved' | 'manual_review' | 'awaiting_signature' | 'declined' | 'signed';
    return (
      <div>
        <h1 className="text-2xl font-semibold">
          {t(`decision.${status === 'signed' ? 'approved' : status}.title` as MessageKey)}
        </h1>
        <p className="mt-2 text-stone-700 dark:text-stone-300">
          {t(`decision.${status === 'signed' ? 'approved' : status}.text` as MessageKey, {
            date: application.holdUntil ?? '',
            email: application.signatoryEmail ?? '',
          })}
        </p>

        {application.decisionReasons ? (
          <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
            <h2 className="text-sm font-semibold">{t('decision.reasonsTitle')}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {application.decisionReasons.map((reason) => (
                <li key={reason.rule} className="flex items-start justify-between gap-4">
                  <div>
                    <p>{t(`reason.${reason.rule}` as MessageKey)}</p>
                    {reason.rule === 'min_age' && reason.outcome === 'failed' ? (
                      <p className="text-stone-600 dark:text-stone-400">
                        {t('reason.min_age.eligibleFrom', {
                          date: String(reason.params?.eligibleFrom ?? ''),
                        })}
                      </p>
                    ) : null}
                    {reason.rule === 'affordability' && reason.params?.limitCents !== undefined ? (
                      <p className="text-stone-600 dark:text-stone-400">
                        {t('reason.affordability.detail', {
                          rent: euro(Number(reason.params.monthlyRentWithVatCents ?? 0)),
                          limit: euro(Number(reason.params.limitCents)),
                        })}
                      </p>
                    ) : null}
                    {reason.rule === 'affordability' &&
                    reason.params?.note === 'income_not_asked' ? (
                      <p className="text-stone-600 dark:text-stone-400">
                        {t('reason.affordability.notAsked')}
                      </p>
                    ) : null}
                  </div>
                  <OutcomeBadge t={t} outcome={reason.outcome} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          {status === 'approved' ? (
            <button
              type="button"
              onClick={sign}
              disabled={busy}
              className="rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {t('decision.sign')}
            </button>
          ) : null}
          <Link
            href={`/${locale}${suffix}`}
            className="rounded-xl px-4 py-3 font-medium ring-1 ring-stone-300 ring-inset hover:bg-stone-50 dark:ring-stone-700 dark:hover:bg-stone-800"
          >
            {t('asset.backToCatalogue')}
          </Link>
        </div>
      </div>
    );
  }

  // ---- blocked (age / country): the form stops kindly ------------------------------
  if (blocked && !editingId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">{t('apply.title')}</h1>
        <p className="mt-4 rounded-xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200 ring-inset dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800">
          {blocked.rule === 'age_under'
            ? t('apply.blockedAge', { date: blocked.eligibleFrom ?? '' })
            : t('apply.blockedCountry')}
        </p>
        <AnsweredList
          t={t}
          locale={locale}
          answered={answered}
          answers={application.answers}
          onEdit={(id) => {
            setEditingId(id);
            setDraft(String(application.answers[id] ?? ''));
          }}
        />
      </div>
    );
  }

  // ---- the running form -------------------------------------------------------------
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

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t('apply.title')}</h1>

      {showBatch ? (
        <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-800 dark:bg-emerald-950/40">
          <h2 className="text-lg font-medium">{t('apply.prefillBasics')}</h2>
          <ul className="mt-3 divide-y divide-emerald-100 text-sm dark:divide-emerald-900">
            {batchItems.map(({ question, value }) => (
              <li key={question.id} className="flex items-baseline justify-between gap-4 py-2">
                <span className="text-stone-600 dark:text-stone-400">
                  {question.text[locale] ?? question.text.en}
                </span>
                <span className="font-medium">
                  {question.type === 'choice'
                    ? optionLabel(t, String(value))
                    : Array.isArray(value)
                      ? value.join(', ')
                      : String(value)}
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
        </section>
      ) : null}

      {!current && !showBatch ? (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
          <label htmlFor="start" className="block text-sm font-medium">
            {t('apply.startDate')}
          </label>
          <input
            id="start"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="mt-1 rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
          />
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
            disabled={busy}
            className="mt-5 w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {t('apply.submit')}
          </button>
        </section>
      ) : null}

      <AnsweredList
        t={t}
        locale={locale}
        answered={answered}
        answers={application.answers}
        onEdit={(id) => {
          setEditingId(id);
          setDraft(String(application.answers[id] ?? ''));
        }}
      />
    </div>
  );
}

function QuestionInput({
  t,
  question,
  draft,
  setDraft,
  busy,
  onSubmit,
}: {
  t: Translate;
  question: Question;
  draft: string;
  setDraft: (value: string) => void;
  busy: boolean;
  onSubmit: (value: unknown) => void;
}) {
  if (question.type === 'choice') {
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        {question.options?.map((option) => (
          <button
            key={option}
            type="button"
            disabled={busy}
            onClick={() => onSubmit(option)}
            className="rounded-lg px-4 py-2 text-sm font-medium ring-1 ring-stone-300 ring-inset hover:bg-emerald-50 dark:ring-stone-700 dark:hover:bg-stone-800"
          >
            {optionLabel(t, option)}
          </button>
        ))}
      </div>
    );
  }
  const inputType =
    question.type === 'date'
      ? 'date'
      : question.type === 'email'
        ? 'email'
        : question.type === 'money'
          ? 'number'
          : 'text';
  return (
    <form
      className="mt-4 flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.trim() === '') return;
        if (question.type === 'money') onSubmit(Math.round(Number(draft) * 100));
        else if (question.type === 'list')
          onSubmit(
            draft
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          );
        else onSubmit(draft.trim());
      }}
    >
      <input
        type={inputType}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        required
        min={question.type === 'money' ? 0 : undefined}
        className="flex-1 rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {t('apply.continue')}
      </button>
    </form>
  );
}

function AnsweredList({
  t,
  locale,
  answered,
  answers,
  onEdit,
}: {
  t: Translate;
  locale: Locale;
  answered: Question[];
  answers: Record<string, unknown>;
  onEdit: (id: string) => void;
}) {
  if (answered.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-stone-600 dark:text-stone-400">
        {t('apply.yourAnswers')}
      </h2>
      <ul className="mt-2 divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white text-sm dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
        {answered.map((question) => {
          const value = answers[question.id];
          const shown =
            question.type === 'choice'
              ? optionLabel(t, String(value))
              : question.type === 'money'
                ? formatEuro(Number(value), intlLocale[locale])
                : Array.isArray(value)
                  ? value.join(', ')
                  : String(value);
          return (
            <li key={question.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-stone-600 dark:text-stone-400">
                  {question.text[locale] ?? question.text.en}
                </p>
                <p className="font-medium">{shown}</p>
              </div>
              <button
                type="button"
                onClick={() => onEdit(question.id)}
                className="shrink-0 text-emerald-800 hover:underline dark:text-emerald-300"
              >
                {t('apply.edit')}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function OutcomeBadge({ t, outcome }: { t: Translate; outcome: string }) {
  const styles: Record<string, string> = {
    passed:
      'bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800',
    failed:
      'bg-red-50 text-red-900 ring-red-200 dark:bg-red-950 dark:text-red-200 dark:ring-red-800',
    manual_review:
      'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800',
    not_applicable:
      'bg-stone-100 text-stone-600 ring-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:ring-stone-700',
  };
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[outcome] ?? styles.not_applicable}`}
    >
      {t(`outcome.${outcome}` as MessageKey)}
    </span>
  );
}
