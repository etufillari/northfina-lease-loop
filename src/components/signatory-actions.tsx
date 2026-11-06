'use client';

// What the company's signatory can do with a request waiting for them (card 6): sign it
// (tick that they've read it and type their full name, the same rule as every signature) or
// decline it with an optional note for the applicant. Both go to /api/admin/signatures/:id.
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { checkPersonName, MAX_PERSON_NAME_LENGTH } from '@/domain/names';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type SignatoryActionsProps = { requestId: string; locale: Locale };

const errorKeys = {
  QUOTE_EXPIRED: 'contract.error.expired',
  ASSET_NOT_AVAILABLE: 'contract.error.taken',
  NOT_WAITING: 'signatures.error.notWaiting',
  LATER_HISTORY: 'signatures.error.laterHistory',
} as const;

const fieldClass =
  'mt-1 block w-full max-w-sm rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/30 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100';

export function SignatoryActions({ requestId, locale }: SignatoryActionsProps) {
  const t = getT(locale);
  const router = useRouter();
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState<'sign' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post(action: 'sign' | 'decline', body: object) {
    setSending(action);
    setError(null);
    try {
      const response = await fetch(`/api/admin/signatures/${requestId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { success: boolean; error?: { code: string } };
      if (payload.success) {
        router.refresh();
        return;
      }
      const code = payload.error?.code;
      setError(
        t(
          code && code in errorKeys
            ? errorKeys[code as keyof typeof errorKeys]
            : 'contract.error.generic'
        )
      );
    } catch {
      setError(t('contract.error.generic'));
    } finally {
      setSending(null);
    }
  }

  const nameValid = checkPersonName(name) === null;
  const showNameHint = name.trim() !== '' && !nameValid;

  function sign(event: FormEvent) {
    event.preventDefault();
    void post('sign', { signerName: name });
  }

  function decline(event: FormEvent) {
    event.preventDefault();
    void post('decline', { note: note.trim() || null });
  }

  return (
    <div className="mt-6 grid gap-6 md:grid-cols-2">
      <form
        onSubmit={sign}
        aria-labelledby="signatory-sign-heading"
        className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-900 dark:bg-emerald-950/40"
      >
        <h3 id="signatory-sign-heading" className="font-semibold">
          {t('signatures.signTitle')}
        </h3>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            className="mt-1 size-4 accent-emerald-700"
          />
          {t('signatures.agree')}
        </label>
        <label className="mt-3 block text-sm font-medium">
          {t('contract.typeName')}
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            maxLength={MAX_PERSON_NAME_LENGTH}
            aria-invalid={showNameHint || undefined}
            aria-describedby={showNameHint ? 'signatory-name-hint' : undefined}
            className={fieldClass}
          />
        </label>
        {showNameHint ? (
          <p
            id="signatory-name-hint"
            role="status"
            className="mt-1 text-sm text-amber-900 dark:text-amber-200"
          >
            {t('contract.error.invalidName')}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={!agreed || !nameValid || sending !== null}
          className="mt-4 rounded-lg bg-emerald-700 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending === 'sign' ? t('contract.signing') : t('signatures.sign')}
        </button>
      </form>

      <form
        onSubmit={decline}
        aria-labelledby="signatory-decline-heading"
        className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900"
      >
        <h3 id="signatory-decline-heading" className="font-semibold">
          {t('signatures.declineTitle')}
        </h3>
        <label className="mt-3 block text-sm font-medium">
          {t('signatures.note')}
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            rows={3}
            className={fieldClass}
          />
        </label>
        <button
          type="submit"
          disabled={sending !== null}
          className="mt-4 rounded-lg px-5 py-2.5 font-semibold text-rose-800 ring-1 ring-rose-700/40 ring-inset hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:ring-rose-400/40 dark:hover:bg-rose-950"
        >
          {sending === 'decline' ? t('signatures.declining') : t('signatures.decline')}
        </button>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-rose-800 md:col-span-2 dark:text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
