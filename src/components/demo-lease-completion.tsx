'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
export function DemoLeaseCompletion({
  leaseId,
  labels,
}: {
  leaseId: string;
  labels: {
    button: string;
    help: string;
    confirm: string;
    cancel: string;
    busy: string;
    error: string;
  };
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function complete() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/leases/${leaseId}/demo-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error('failed');
      document.getElementById(`next-${leaseId}`)?.focus();
      router.refresh();
    } catch {
      setError(true);
      setBusy(false);
    }
  }
  return (
    <div
      className="my-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      aria-busy={busy}
    >
      <p
        className="mb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300"
        id={`demo-help-${leaseId}`}
      >
        {labels.help}
      </p>
      {!confirming ? (
        <button
          type="button"
          aria-describedby={`demo-help-${leaseId}`}
          onClick={() => setConfirming(true)}
          className="ui-secondary"
        >
          {labels.button}
        </button>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={() => void complete()}
            className="ui-primary"
          >
            {busy ? labels.busy : labels.confirm}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(false)}
            className="ui-secondary"
          >
            {labels.cancel}
          </button>
        </div>
      )}
      {error && (
        <p className="mt-3 text-red-700 dark:text-red-300" role="alert">
          {labels.error}
        </p>
      )}
    </div>
  );
}
