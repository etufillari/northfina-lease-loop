'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
export function CancelLeaseRequest({
  locale,
  contractId,
  requestId,
}: {
  locale: Locale;
  contractId: string;
  requestId: string;
}) {
  const t = getT(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function cancel() {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(
        `/api/leases/${encodeURIComponent(contractId)}/requests/${encodeURIComponent(requestId)}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void cancel()}
        className="mt-2 min-h-target text-caption text-primary underline disabled:opacity-50"
      >
        {t(busy ? 'auth.working' : 'customer.cancelRequest')}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-caption">
          {t('customer.cancelError')}
        </p>
      ) : null}
    </div>
  );
}
