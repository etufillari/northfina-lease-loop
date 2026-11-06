'use client';

// The recipient of a passed-on item says yes or no.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

export function HandoverResponse({ handoverId, locale }: { handoverId: string; locale: Locale }) {
  const t = getT(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function answer(accept: boolean) {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/handovers/${handoverId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept }),
      });
      if (!response.ok) throw new Error('refused');
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
        disabled={busy}
        onClick={() => void answer(true)}
        className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {t('notifications.accept')}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void answer(false)}
        className="rounded-lg px-4 py-2 text-sm font-semibold text-stone-700 ring-1 ring-stone-300 ring-inset hover:bg-stone-100 disabled:opacity-50 dark:text-stone-300 dark:ring-stone-600 dark:hover:bg-stone-800"
      >
        {t('notifications.decline')}
      </button>
      {failed ? (
        <p role="alert" className="text-sm font-medium text-rose-700 dark:text-rose-300">
          {t('end.failed')}
        </p>
      ) : null}
    </div>
  );
}
