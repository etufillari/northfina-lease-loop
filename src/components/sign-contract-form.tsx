'use client';

// Signing: tick that you have read the contract and type your full name. The server checks
// the application again and locks the price; then we go to the signed contract. With a
// `fleetId` it signs every contract of that fleet at once and goes back to the fleet.
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { checkPersonName, MAX_PERSON_NAME_LENGTH } from '@/domain/names';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { useSessionState } from './use-session-state';

type SignContractFormProps = {
  /** The application to sign, or the fleet whose applications are all signed together. */
  target: { applicationId: string } | { fleetId: string };
  defaultName: string;
  locale: Locale;
};

const errorKeys = {
  QUOTE_EXPIRED: 'contract.error.expired',
  ASSET_NOT_AVAILABLE: 'contract.error.taken',
  NOT_APPROVED: 'contract.error.notApproved',
} as const;

export function SignContractForm({ target, defaultName, locale }: SignContractFormProps) {
  const t = getT(locale);
  const router = useRouter();
  // Kept in session storage, so switching language keeps the typed name and the tick.
  const initial = useMemo(() => ({ name: defaultName, agreed: false }), [defaultName]);
  const fleetId = 'fleetId' in target ? target.fleetId : null;
  const key = 'fleetId' in target ? `fleet:${target.fleetId}` : target.applicationId;
  const [draft, setDraft] = useSessionState(`sign:${key}`, initial);
  const { name, agreed } = draft;
  const setName = (next: string) => setDraft((current) => ({ ...current, name: next }));
  const setAgreed = (next: boolean) => setDraft((current) => ({ ...current, agreed: next }));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sign(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      const response = await fetch(fleetId ? `/api/fleets/${fleetId}/sign` : '/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fleetId ? { signerName: name } : { ...target, signerName: name }),
      });
      const payload = (await response.json()) as {
        success: boolean;
        data?: { id: string };
        error?: { code: string; details?: { contractId?: string } };
      };
      if (fleetId && (payload.success || payload.error?.code === 'ALREADY_SIGNED')) {
        router.push(`/${locale}/fleets/${fleetId}`);
        router.refresh();
        return;
      }
      const contractId = payload.data?.id ?? payload.error?.details?.contractId;
      if (contractId) {
        router.push(`/${locale}/contracts/${contractId}`);
        return;
      }
      const code = payload.error?.code as keyof typeof errorKeys | undefined;
      setError(t(code && code in errorKeys ? errorKeys[code] : 'contract.error.generic'));
    } catch {
      setError(t('contract.error.generic'));
    } finally {
      setSending(false);
    }
  }

  // The same rule as the server: at least two letters, no digits (see names.ts).
  const nameValid = checkPersonName(name) === null;
  const showNameHint = name.trim() !== '' && !nameValid;
  const canSign = agreed && nameValid && !sending;

  return (
    <form
      onSubmit={sign}
      className="mt-6 space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-800 dark:bg-emerald-950 print:hidden"
    >
      <h2 className="text-lg font-semibold">{t('contract.signTitle')}</h2>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mt-0.5 size-4 accent-emerald-700"
        />
        {t('contract.agree')}
      </label>
      <label className="block text-sm font-medium">
        {t('contract.typeName')}
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          maxLength={MAX_PERSON_NAME_LENGTH}
          aria-invalid={showNameHint || undefined}
          aria-describedby={showNameHint ? 'signer-name-hint' : undefined}
          className="mt-1 block w-full max-w-sm rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/30 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
        />
      </label>
      {showNameHint ? (
        <p
          id="signer-name-hint"
          role="status"
          className="text-sm text-amber-900 dark:text-amber-200"
        >
          {t('contract.error.invalidName')}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!canSign}
        className="rounded-lg bg-emerald-700 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? t('contract.signing') : t('contract.sign')}
      </button>
      {error ? (
        <p role="alert" className="text-sm font-medium text-rose-700 dark:text-rose-300">
          {error}
        </p>
      ) : null}
    </form>
  );
}
