'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function ReturnRequest({
  leaseId,
  usageValue,
  usageUnit,
  status,
  labels,
}: {
  leaseId: string;
  usageValue: number;
  usageUnit: string;
  status: string | null;
  labels: {
    title: string;
    usage: string;
    submit: string;
    pending: string;
    processing: string;
    ready: string;
    rejected: string;
    error: string;
    busy: string;
    unit: string;
  };
}) {
  const router = useRouter();
  const [value, setValue] = useState(usageValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/leases/${leaseId}/return`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `return:${leaseId}:${value}`,
        },
        body: JSON.stringify({ usageValue: value }),
      });
      if (!response.ok) throw new Error('return_request_failed');
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (status) {
    const message =
      status === 'REQUESTED'
        ? labels.pending
        : status === 'READY'
          ? labels.ready
          : status === 'REJECTED'
            ? labels.rejected
            : labels.processing;
    return (
      <p
        role="status"
        aria-live="polite"
        className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100"
      >
        {message}
      </p>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mt-4 space-y-3 border-t border-stone-200 pt-4 dark:border-stone-700"
    >
      <h4 className="font-semibold">{labels.title}</h4>
      <label className="block text-sm">
        {labels.usage}
        <span className="mt-1 flex items-center gap-2">
          <input
            type="number"
            min={usageValue}
            step={1}
            required
            value={value}
            onChange={(event) => setValue(Number(event.target.value))}
            className="ui-control max-w-48"
          />
          <span>{labels.unit || usageUnit}</span>
        </span>
      </label>
      <button type="submit" disabled={busy || value < usageValue} className="ui-primary">
        {busy ? labels.busy : labels.submit}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {labels.error}
        </p>
      )}
    </form>
  );
}
