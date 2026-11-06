'use client';
// The nominee's answer to an invitation: accept (first claim on the item once it is ready)
// or decline.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

export function NominationActions({
  locale,
  assetId,
  actor,
  asOfParam,
}: {
  locale: Locale;
  assetId: string;
  actor: string;
  asOfParam: string | null;
}) {
  const t = getT(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(accept: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/nominations/${assetId}${asOfParam ? `?asOf=${asOfParam}` : ''}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ accept, actor }),
        }
      );
      const body = await response.json();
      if (body.success) router.refresh();
      else setError(body.error?.message ?? t('common.error'));
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => answer(true)}
        className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {t('nomination.accept')}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => answer(false)}
        className="rounded-lg px-4 py-2 text-sm font-medium ring-1 ring-stone-300 ring-inset hover:bg-stone-50 disabled:opacity-50 dark:ring-stone-700 dark:hover:bg-stone-800"
      >
        {t('nomination.decline')}
      </button>
      {error ? (
        <p role="alert" className="w-full text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
