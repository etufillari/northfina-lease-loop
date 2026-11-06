'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  leaseId: string | null;
  pendingPeriods: number[];
  locale: string;
  labels: {
    buyout: string;
    passOn: string;
    releaseEarlier: string;
    generate: string;
    busy: string;
    error: string;
  };
};
export function LeaseEngineActions({ leaseId, pendingPeriods, locale, labels }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function generateInvoice() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const periodIndex = pendingPeriods[0];
      if (!leaseId || periodIndex === undefined) throw new Error('invoice_unavailable');
      const response = await fetch(`/api/leases/${leaseId}/invoices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `ui:${leaseId}:${periodIndex}`,
        },
        body: JSON.stringify({ periodIndex }),
      });
      if (!response.ok) throw new Error('request_failed');
      router.push(`/${locale}/invoices`);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <button
        type="button"
        disabled
        className="rounded bg-emerald-700 px-2 py-2 text-sm text-white opacity-50"
      >
        {labels.buyout}
      </button>
      <button
        type="button"
        disabled
        className="rounded bg-emerald-700 px-2 py-2 text-sm text-white opacity-50"
      >
        {labels.passOn}
      </button>
      <button
        type="button"
        disabled
        className="rounded bg-emerald-700 px-2 py-2 text-sm text-white opacity-50"
      >
        {labels.releaseEarlier}
      </button>
      <button
        type="button"
        disabled={busy || !leaseId || pendingPeriods.length === 0}
        onClick={() => void generateInvoice()}
        className="rounded bg-emerald-700 px-2 py-2 text-sm text-white disabled:opacity-50"
      >
        {busy ? labels.busy : labels.generate}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-red-700">
          {labels.error}
        </p>
      )}
    </div>
  );
}
