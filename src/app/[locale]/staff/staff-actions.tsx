'use client';
// The staff desk buttons. Every action is a separate, audit-logged POST. After a success the
// card keeps its result on screen (and the contract link); "Update the list" refreshes it.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getT, type MessageKey } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { DateField } from '@/components/date-field';

type Envelope<T> =
  { success: true; data: T } | { success: false; error: { code: string; message: string } };

async function post<T>(url: string, body: unknown): Promise<Envelope<T>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await response.json()) as Envelope<T>;
}

/** Envelope error codes we can explain better than the generic message. */
const ERROR_KEYS: Record<string, MessageKey> = {
  NOT_REVIEWABLE: 'staff.error.alreadyHandled',
  SELF_DECISION: 'staff.error.selfDecision',
  NOT_SIGNABLE: 'staff.error.alreadyHandled',
  HOLD_EXPIRED: 'staff.error.holdExpired',
  QUOTE_EXPIRED: 'staff.error.quoteExpired',
  BAD_START_DATE: 'staff.error.badStartDate',
};

function useAction(locale: Locale) {
  const t = getT(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [done, setDone] = useState(false);

  async function run<T>(url: string, body: unknown, onOk: (data: T) => string) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await post<T>(url, body);
      if (result.success) {
        setMessage({ kind: 'ok', text: onOk(result.data) });
        setDone(true);
      } else {
        const key = ERROR_KEYS[result.error.code];
        setMessage({ kind: 'error', text: key ? t(key) : result.error.message });
      }
    } catch {
      setMessage({ kind: 'error', text: t('common.error') });
    } finally {
      setBusy(false);
    }
  }
  const refresh = () => router.refresh();
  return { t, busy, done, message, run, refresh };
}

function Feedback({
  message,
  onRefresh,
  refreshLabel,
}: {
  message: { kind: 'ok' | 'error'; text: string } | null;
  onRefresh: () => void;
  refreshLabel: string;
}) {
  if (!message) return null;
  return (
    <p
      role={message.kind === 'error' ? 'alert' : 'status'}
      className={`mt-3 text-sm ${message.kind === 'error' ? 'text-red-700 dark:text-red-400' : 'text-emerald-800 dark:text-emerald-300'}`}
    >
      {message.text}{' '}
      <button type="button" onClick={onRefresh} className="font-medium underline">
        {refreshLabel}
      </button>
    </p>
  );
}

const button =
  'rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50';

export function ReviewActions({
  locale,
  applicationId,
  actor,
}: {
  locale: Locale;
  applicationId: string;
  actor: string;
}) {
  const { t, busy, done, message, run, refresh } = useAction(locale);
  const [note, setNote] = useState('');
  const noteId = `note-${applicationId}`;
  const body = { actor, ...(note.trim() ? { note: note.trim() } : {}) };

  return (
    <div>
      <label htmlFor={noteId} className="block text-sm font-medium">
        {t('staff.note')}
      </label>
      <input
        id={noteId}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={500}
        className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
      />
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy || done}
          className={`${button} bg-emerald-700 text-white hover:bg-emerald-800`}
          onClick={() =>
            run<{ status: string }>(
              `/api/staff/applications/${applicationId}/approve`,
              body,
              (data) =>
                t(
                  data.status === 'awaiting_signature'
                    ? 'staff.done.awaitingSignature'
                    : 'staff.done.approved'
                )
            )
          }
        >
          {t('staff.approve')}
        </button>
        <button
          type="button"
          disabled={busy || done}
          className={`${button} border border-red-300 text-red-800 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950`}
          onClick={() => {
            if (!window.confirm(t('staff.confirmDecline'))) return;
            void run(`/api/staff/applications/${applicationId}/decline`, body, () =>
              t('staff.done.declined')
            );
          }}
        >
          {t('staff.decline')}
        </button>
      </div>
      <Feedback message={message} onRefresh={refresh} refreshLabel={t('staff.refresh')} />
    </div>
  );
}

export function SignAsSignatory({
  locale,
  applicationId,
  signatoryEmail,
  defaultStartDate,
}: {
  locale: Locale;
  applicationId: string;
  signatoryEmail: string;
  defaultStartDate: string;
}) {
  const { t, busy, done, message, run, refresh } = useAction(locale);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [contractId, setContractId] = useState<string | null>(null);
  const inputId = `start-${applicationId}`;

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium">
        {t('staff.startDate')}
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <DateField
          locale={locale}
          id={inputId}
          value={startDate}
          min={defaultStartDate}
          onChange={setStartDate}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
        />
        <button
          type="button"
          disabled={busy || done || !startDate}
          className={`${button} bg-emerald-700 text-white hover:bg-emerald-800`}
          onClick={() =>
            run<{ contractId: string }>(
              `/api/applications/${applicationId}/sign`,
              // The signatory is the actor: the audit log shows who really signed.
              { startDate, actor: signatoryEmail },
              (data) => {
                setContractId(data.contractId);
                return t('staff.done.signed');
              }
            )
          }
        >
          {t('staff.signAs', { email: signatoryEmail })}
        </button>
      </div>
      <p className="mt-2 text-xs text-stone-600 dark:text-stone-400">{t('staff.signHint')}</p>
      <Feedback message={message} onRefresh={refresh} refreshLabel={t('staff.refresh')} />
      {contractId ? (
        <Link
          href={`/${locale}/contracts/${contractId}`}
          className="mt-2 inline-block text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300"
        >
          {t('staff.viewContract')} →
        </Link>
      ) : null}
    </div>
  );
}

/** One button for every hold that ran out; each release is audited on its own. */
export function ReleaseExpiredHolds({
  locale,
  actor,
  count,
  asOf,
}: {
  locale: Locale;
  actor: string;
  count: number;
  /** The date the page listed the holds for, so the release uses the very same "today". */
  asOf: string;
}) {
  const { t, busy, done, message, run, refresh } = useAction(locale);
  return (
    <div className="mt-4">
      <p className="text-sm text-stone-600 dark:text-stone-400">{t('staff.expired.explain')}</p>
      <button
        type="button"
        disabled={busy || done}
        className={`${button} mt-3 bg-amber-700 text-white hover:bg-amber-800`}
        onClick={() =>
          run<{ released: Array<{ releasedAssetIds: string[] }> }>(
            `/api/staff/holds/release?asOf=${asOf}`,
            { actor },
            (data) =>
              t('staff.done.released', {
                applications: data.released.length,
                items: data.released.reduce((sum, r) => sum + r.releasedAssetIds.length, 0),
              })
          )
        }
      >
        {t('staff.expired.release', { count })}
      </button>
      <Feedback message={message} onRefresh={refresh} refreshLabel={t('staff.refresh')} />
    </div>
  );
}
