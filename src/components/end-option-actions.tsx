'use client';
import { EarlyExitPreview } from './early-exit-preview';
import type { Locale } from '@/i18n/locales';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function EndOptionActions({
  leaseId,
  status,
  locale,
  labels,
  maxElapsedMonths = 47,
}: {
  leaseId: string;
  status: string;
  locale: Locale;
  maxElapsedMonths?: number;
  labels: {
    return: string;
    pass: string;
    buy: string;
    early: string;
    error: string;
    returnHelp: string;
    passHelp: string;
    buyHelp: string;
    earlyHelp: string;
    busy: string;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [showExit, setShowExit] = useState(false);
  async function run(option: string, elapsedMonths = 6) {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/leases/${leaseId}/end-option`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          option,
          ...(option === 'EARLY_RETURN' ? { elapsedMonths } : {}),
        }),
      });
      if (!response.ok) throw new Error('failed');
      if (['RETURN', 'PASS_ON', 'EARLY_RETURN'].includes(option)) router.push(`/${locale}/leases`);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-3" aria-busy={busy}>
      {(status === 'COMPLETED'
        ? ['RETURN', 'PASS_ON', 'BUYOUT']
        : status === 'ACTIVE'
          ? ['EARLY_RETURN']
          : []
      ).map((option) => (
        <div key={option} className="ui-surface flex flex-col gap-3 p-4">
          <p
            id={`option-${leaseId}-${option}`}
            className="grow text-sm leading-relaxed text-slate-600 dark:text-slate-300"
          >
            {option === 'RETURN'
              ? labels.returnHelp
              : option === 'PASS_ON'
                ? labels.passHelp
                : option === 'BUYOUT'
                  ? labels.buyHelp
                  : labels.earlyHelp}
          </p>
          <button
            aria-describedby={`option-${leaseId}-${option}`}
            type="button"
            disabled={busy}
            onClick={() => (option === 'EARLY_RETURN' ? setShowExit(true) : void run(option))}
            className="ui-secondary mt-auto w-full"
          >
            {option === 'RETURN'
              ? labels.return
              : option === 'PASS_ON'
                ? labels.pass
                : option === 'BUYOUT'
                  ? labels.buy
                  : labels.early}
          </button>
        </div>
      ))}
      {showExit && status === 'ACTIVE' && (
        <EarlyExitPreview
          leaseId={leaseId}
          locale={locale}
          busy={busy}
          maxElapsedMonths={maxElapsedMonths}
          confirm={(elapsed) => run('EARLY_RETURN', elapsed)}
        />
      )}
      {busy && (
        <p role="status" className="sm:col-span-3">
          {labels.busy}
        </p>
      )}
      {error && (
        <p role="alert" className="sm:col-span-3 text-red-700 dark:text-red-300">
          {labels.error}
        </p>
      )}
    </div>
  );
}
