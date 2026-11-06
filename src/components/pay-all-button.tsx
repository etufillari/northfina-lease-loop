'use client';

// "Pay all": settles every due invoice in one go (demo payments; no money moves). With a
// contractId it pays only that contract's invoices.
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type PayAllButtonProps = { contractId?: string; label: string; failedLabel: string };

export function PayAllButton({ contractId, label, failedLabel }: PayAllButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function payAll() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch('/api/invoices/pay-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contractId ? { contractId } : {}),
      });
      if (!response.ok) throw new Error('not paid');
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void payAll()}
        disabled={busy}
        className="rounded-lg bg-amber-600 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
      >
        {label}
      </button>
      {failed ? (
        <p role="alert" className="text-sm font-medium text-rose-700 dark:text-rose-300">
          {failedLabel}
        </p>
      ) : null}
    </div>
  );
}
