'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

/** The signatory confirms their authority and signs. */
export function SignContractForm({
  contractId,
  token,
  labels,
}: {
  contractId: string;
  token: string;
  labels: { confirm: string; sign: string; error: string };
}) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed || busy) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/contracts/${encodeURIComponent(contractId)}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, confirm: true }),
      });
      if (response.ok) router.refresh();
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-8">
      <label className="flex items-start gap-3 text-body">
        <input
          type="checkbox"
          required
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-1 size-5"
        />
        <span>{labels.confirm}</span>
      </label>
      <button
        type="submit"
        disabled={!confirmed || busy}
        className="pressable mt-6 inline-flex min-h-target items-center rounded-pill bg-primary px-6 py-3 text-on-dark disabled:opacity-60"
      >
        {labels.sign}
      </button>
      <p role="status" className="mt-4 text-caption text-ink-muted">
        {error ? labels.error : null}
      </p>
    </form>
  );
}
