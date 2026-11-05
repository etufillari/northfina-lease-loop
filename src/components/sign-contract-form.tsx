'use client';

// Signing: tick that you have read the contract and type your full name. The server checks
// the application again and locks the price; then we go to the signed contract.
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type SignContractFormProps = { applicationId: string; defaultName: string; locale: Locale };

const errorKeys = {
  QUOTE_EXPIRED: 'contract.error.expired',
  ASSET_NOT_AVAILABLE: 'contract.error.taken',
  NOT_APPROVED: 'contract.error.notApproved',
} as const;

export function SignContractForm({ applicationId, defaultName, locale }: SignContractFormProps) {
  const t = getT(locale);
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [agreed, setAgreed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sign(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      const response = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, signerName: name }),
      });
      const payload = (await response.json()) as {
        success: boolean;
        data?: { id: string };
        error?: { code: string; details?: { contractId?: string } };
      };
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

  const canSign = agreed && name.trim().length >= 2 && !sending;

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
          maxLength={100}
          className="mt-1 block w-full max-w-sm rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/30 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
        />
      </label>
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
