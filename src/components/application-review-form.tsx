'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Approve or reject one application waiting for review, with a required note. */
export function ApplicationReviewForm({
  id,
  labels,
}: {
  id: string;
  labels: { note: string; approve: string; reject: string; error: string };
}) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function decide(decision: 'approve' | 'reject') {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/staff/applications/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note }),
      });
      if (response.ok) router.refresh();
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  const valid = note.trim().length >= 3;
  const button =
    'pressable min-h-target rounded-pill px-5 text-caption font-semibold disabled:opacity-60';
  return (
    <div className="mt-4">
      <label htmlFor={`note-${id}`} className="text-caption font-semibold">
        {labels.note}
      </label>
      <textarea
        id={`note-${id}`}
        value={note}
        maxLength={500}
        rows={2}
        onChange={(event) => setNote(event.target.value)}
        className="mt-2 w-full rounded-sm border border-hairline p-3 text-caption"
      />
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy || !valid}
          onClick={() => void decide('approve')}
          className={`${button} bg-ink text-white`}
        >
          {labels.approve}
        </button>
        <button
          type="button"
          disabled={busy || !valid}
          onClick={() => void decide('reject')}
          className={`${button} border border-hairline`}
        >
          {labels.reject}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-caption text-red-700">
          {labels.error}
        </p>
      ) : null}
    </div>
  );
}
