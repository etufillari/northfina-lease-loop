import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { AssetCondition } from '@/data/schemas';
import {
  joinWaitingInputSchema,
  ownWaitingListSchema,
  waitingActionSchema,
  type OwnWaitingRequests,
} from '@/data/waiting-list-schemas';
import { parseCents } from '@/domain/money-arithmetic';
import { moneyInputText } from './form-values';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { requestJson, RequestFailure } from './api';
import type { Bootstrap } from './price-panel';
import { buttonClass, Field, inputClass, messageFor, panelClass } from './ui';

export function WaitingListPanel({
  data,
  locale,
  busy,
  onChanged,
}: {
  data: Bootstrap;
  locale: Locale;
  busy: boolean;
  onChanged: () => void;
}) {
  const t = getT(locale);
  const category = data.asset.category;
  const canJoin = !data.availableForSelectedCustomer;
  const [condition, setCondition] = useState<AssetCondition>('good');
  const [budget, setBudget] = useState('');
  const [term, setTerm] = useState(12);
  const [neededBy, setNeededBy] = useState(data.businessDate);
  const [records, setRecords] = useState<OwnWaitingRequests | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadRevision, setLoadRevision] = useState(0);
  const [editing, setEditing] = useState<{ id: string; revision: number } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const manuallyToggled = useRef(false);
  const conditionInput = useRef<HTMLSelectElement>(null);
  const retry = useRef<{ key: string; id: string } | null>(null);
  const selection = { customerId: data.customer.id, businessDate: data.businessDate };
  useEffect(() => {
    if (editing) conditionInput.current?.focus();
  }, [editing]);
  useEffect(() => {
    const controller = new AbortController();
    requestJson(
      'waiting-list',
      { customerId: data.customer.id, businessDate: data.businessDate },
      ownWaitingListSchema,
      undefined,
      false,
      controller.signal
    )
      .then((rows) => {
        if (controller.signal.aborted) return;
        setRecords(rows);
        if (!manuallyToggled.current) {
          setExpanded(rows.some((row) => row.category === category && row.status !== 'cancelled'));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('REQUEST_FAILED');
          setExpanded(true);
        }
      });
    return () => controller.abort();
  }, [data.customer.id, data.businessDate, category, loadRevision]);
  const money = parseCents(budget);
  const categoryRecords = records?.filter((row) => row.category === category) ?? null;
  const preferences = {
    category,
    minCondition: condition,
    monthlyBudgetCents: money.ok ? money.cents : null,
    termMonths: term,
    neededBy,
  };
  const valid =
    joinWaitingInputSchema.omit({ requestId: true }).safeParse(preferences).success &&
    neededBy >= data.businessDate;
  const alreadyPending = categoryRecords?.some((row) => row.status === 'pending');
  async function change(id?: string) {
    if (pending || busy) return;
    if (!id && !editing && !canJoin) return;
    const key = JSON.stringify({ preferences, editing });
    if (!id && (!valid || (alreadyPending && !editing))) return;
    if (!id && retry.current?.key !== key) retry.current = { key, id: crypto.randomUUID() };
    setPending(true);
    setExpanded(true);
    setError(null);
    try {
      if (id)
        await requestJson(
          'waiting-list/' + encodeURIComponent(id) + '/cancel',
          selection,
          waitingActionSchema,
          {}
        );
      else if (editing)
        await requestJson(
          'waiting-list/' + encodeURIComponent(editing.id) + '/update',
          selection,
          waitingActionSchema,
          {
            requestId: retry.current!.id,
            revision: editing.revision,
            minCondition: condition,
            monthlyBudgetCents: money.ok ? money.cents : null,
            termMonths: term,
            neededBy,
          }
        );
      else
        await requestJson('waiting-list', selection, waitingActionSchema, {
          ...preferences,
          requestId: retry.current!.id,
        });
      retry.current = null;
      setRecords(await requestJson('waiting-list', selection, ownWaitingListSchema));
      setEditing(null);
      onChanged();
    } catch (cause) {
      setError(cause instanceof RequestFailure ? cause.code : 'REQUEST_FAILED');
    } finally {
      setPending(false);
    }
  }
  if (!canJoin && !error && (categoryRecords === null || categoryRecords.length === 0)) return null;
  const showForm = canJoin || editing !== null;
  return (
    <details
      className={panelClass}
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      aria-labelledby="waiting-title"
    >
      <summary
        className="cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4"
        onClick={() => {
          manuallyToggled.current = true;
        }}
      >
        <h2 id="waiting-title" className="inline text-xl font-semibold">
          {t(editing ? 'wait.editTitle' : canJoin ? 'wait.titleFor' : 'wait.manageTitle', {
            category: messageFor(locale, 'category.' + category),
          })}
        </h2>
      </summary>
      <p className="mt-2 font-medium">{t('wait.for', { name: data.customer.name })}</p>
      <p className="mt-2 text-sm">{t('wait.categoryScope')}</p>
      {!canJoin && !editing ? <p className="mt-2 text-sm">{t('wait.availableHelp')}</p> : null}
      {showForm ? (
        <>
          <p className="mt-2 text-sm">{t('wait.help')}</p>
          <fieldset
            disabled={busy || pending || records === null}
            className="mt-4 grid gap-4 sm:grid-cols-2"
          >
            <Field id="waiting-condition" label={t('wait.condition')}>
              <select
                id="waiting-condition"
                ref={conditionInput}
                className={inputClass}
                value={condition}
                onChange={(event) => setCondition(event.target.value as AssetCondition)}
              >
                {(['fair', 'good', 'like_new', 'new'] as const).map((value) => (
                  <option key={value} value={value}>
                    {messageFor(locale, 'condition.' + value)}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="waiting-budget" label={t('wait.budget')}>
              <input
                id="waiting-budget"
                className={inputClass}
                inputMode="decimal"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
              />
            </Field>
            <Field id="waiting-term" label={t('spine.term')}>
              <select
                id="waiting-term"
                className={inputClass}
                value={term}
                onChange={(event) => setTerm(Number(event.target.value))}
              >
                {Object.keys(data.coefficientTable.end_of_term_buyout_percent_of_financed)
                  .map(Number)
                  .sort((a, b) => a - b)
                  .map((value) => (
                    <option key={value} value={value}>
                      {t('spine.months', { count: value })}
                    </option>
                  ))}
              </select>
            </Field>
            <Field id="waiting-deadline" label={t('match.deadline')}>
              <input
                id="waiting-deadline"
                className={inputClass}
                type="date"
                min={data.businessDate}
                value={neededBy}
                onChange={(event) => setNeededBy(event.target.value)}
              />
            </Field>
            <div className="self-end">
              <button
                type="button"
                className={buttonClass}
                disabled={!valid || (alreadyPending && !editing)}
                onClick={() => void change()}
              >
                {pending ? t('spine.pending') : t(editing ? 'wait.save' : 'wait.join')}
              </button>
            </div>
          </fieldset>
        </>
      ) : null}
      {editing ? (
        <button
          type="button"
          className="mt-3 underline"
          disabled={busy || pending}
          onClick={() => {
            setEditing(null);
            retry.current = null;
            setBudget('');
            setCondition('good');
            setTerm(12);
            setNeededBy(data.businessDate);
          }}
        >
          {t('wait.discardEdit')}
        </button>
      ) : null}
      {alreadyPending && !editing && canJoin ? (
        <p className="mt-3 text-sm">{t('wait.alreadyPending')}</p>
      ) : null}
      {error ? (
        <div className="mt-3" role="alert">
          <p>
            {records === null ? t('wait.loadFailed') : messageFor(locale, 'spine.error.' + error)}
          </p>
          {records === null ? (
            <button
              type="button"
              className={buttonClass + ' mt-2'}
              disabled={busy || pending}
              onClick={() => {
                setError(null);
                setLoadRevision((value) => value + 1);
              }}
            >
              {t('spine.retry')}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="mt-4" aria-live="polite">
        <h3 className="font-semibold">{t('wait.yours')}</h3>
        {records === null ? (
          error ? null : (
            <p>{t('spine.loading')}</p>
          )
        ) : categoryRecords?.length === 0 ? (
          <p>{t('wait.empty')}</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {categoryRecords?.map((row) => (
              <li key={row.id} className="rounded-lg border border-stone-300 p-3">
                <p>
                  {messageFor(locale, 'category.' + row.category)} ·{' '}
                  {messageFor(locale, 'condition.' + row.min_condition)} ·{' '}
                  {t('spine.months', { count: row.preferred_term_months })}
                </p>
                <p>
                  {t('wait.summary', {
                    budget: formatEuro(row.max_monthly_net_rent_cents, intlLocale[locale]),
                    date: row.needed_by,
                  })}
                </p>
                <p className="font-medium">{messageFor(locale, 'wait.' + row.status)}</p>
                {row.status === 'pending' && row.category === category ? (
                  <button
                    type="button"
                    className="mt-2 mr-3 rounded-lg border border-stone-400 px-3 py-1.5 text-sm font-medium hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 dark:hover:bg-stone-800"
                    disabled={busy || pending}
                    onClick={() => {
                      setEditing({ id: row.id, revision: row.revision });
                      setCondition(row.min_condition);
                      setBudget(moneyInputText(row.max_monthly_net_rent_cents));
                      setTerm(row.preferred_term_months);
                      setNeededBy(row.needed_by);
                      retry.current = null;
                      setError(null);
                    }}
                  >
                    {t('wait.edit')}
                  </button>
                ) : null}
                {row.status === 'pending' ? (
                  <button
                    type="button"
                    className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950 dark:focus-visible:outline-red-400"
                    disabled={busy || pending}
                    onClick={() => void change(row.id)}
                  >
                    {t('wait.cancel')}
                  </button>
                ) : null}
                {row.allocated_asset_id ? (
                  <Link
                    className="mt-2 block underline"
                    href={'/' + locale + '/lease/' + encodeURIComponent(row.allocated_asset_id)}
                  >
                    {t('wait.openItem')}: {row.allocated_asset_id}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
