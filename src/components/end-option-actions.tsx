'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function EndOptionActions({
  leaseId,
  status,
  labels,
}: {
  leaseId: string;
  status: string;
  labels: { pass: string; buy: string; early: string; error: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function run(option: string) {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/leases/${leaseId}/end-option`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          option,
          ...(option === 'EARLY_RETURN' ? { elapsedMonths: 6 } : {}),
        }),
      });
      if (!response.ok) throw new Error('failed');
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {(status === 'COMPLETED'
        ? ['PASS_ON', 'BUYOUT']
        : status === 'ACTIVE'
          ? ['EARLY_RETURN']
          : []
      ).map((option) => (
        <button
          key={option}
          type="button"
          disabled={busy}
          onClick={() => void run(option)}
          className="rounded border px-3 py-2 disabled:opacity-50"
        >
          {option === 'PASS_ON' ? labels.pass : option === 'BUYOUT' ? labels.buy : labels.early}
        </button>
      ))}
      {error && (
        <p role="alert" className="w-full text-red-700">
          {labels.error}
        </p>
      )}
    </div>
  );
}
