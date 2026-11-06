'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  contractId: string;
  leaseId: string | null;
  status: string;
  pendingPeriods: number[];
  labels: { activate: string; generate: string; complete: string; busy: string; error: string };
};
export function LeaseEngineActions({ contractId, leaseId, status, pendingPeriods, labels }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function run(action: 'activate' | 'generate' | 'complete') {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const requests =
        action === 'generate'
          ? pendingPeriods.map((periodIndex) => ({
              path: `/api/leases/${leaseId}/invoices`,
              body: { periodIndex },
              key: `ui:${leaseId}:${periodIndex}`,
            }))
          : [
              {
                path:
                  action === 'activate'
                    ? `/api/contracts/${contractId}/activate`
                    : `/api/leases/${leaseId}/complete`,
                body: {},
                key: '',
              },
            ];
      for (const item of requests) {
        const response = await fetch(item.path, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': item.key,
          },
          body: JSON.stringify(item.body),
        });
        if (!response.ok) throw new Error('request_failed');
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
      router.refresh();
    }
  }
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {!leaseId && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run('activate')}
          className="ui-primary"
        >
          {busy ? labels.busy : labels.activate}
        </button>
      )}
      {leaseId && pendingPeriods.length > 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run('generate')}
          className="ui-primary"
        >
          {busy ? labels.busy : labels.generate}
        </button>
      )}
      {leaseId && status === 'ACTIVE' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run('complete')}
          className="ui-secondary"
        >
          {busy ? labels.busy : labels.complete}
        </button>
      )}
      {error && (
        <p role="alert" className="w-full text-sm text-red-700 dark:text-red-300">
          {labels.error}
        </p>
      )}
    </div>
  );
}
