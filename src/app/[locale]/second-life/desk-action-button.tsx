'use client';
// One desk action (execute a card, pass on a lapsed offer). The server recomputes everything; the
// button only says who pressed it (the persona) and on which day (the time-travel date).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

export function DeskActionButton({
  locale,
  path,
  label,
  personaId,
  asOfParam,
  tone = 'primary',
}: {
  locale: Locale;
  /** API path to POST to, e.g. `/api/second-life/ebike-007/execute`. */
  path: string;
  label: string;
  personaId: string | null;
  asOfParam: string | null;
  tone?: 'primary' | 'secondary';
}) {
  const t = getT(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!personaId) return;
    setBusy(true);
    try {
      const suffix = asOfParam ? `?asOf=${asOfParam}` : '';
      const response = await fetch(`${path}${suffix}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await response.json();
      if (body.success) router.refresh();
      else window.alert(body.error?.message ?? t('common.error'));
    } catch {
      window.alert(t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  if (!personaId) {
    return <p className="text-sm text-stone-600 dark:text-stone-400">{t('asset.choosePersona')}</p>;
  }
  const style =
    tone === 'primary'
      ? 'bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500'
      : 'bg-white text-stone-900 ring-1 ring-stone-300 ring-inset hover:bg-stone-50 dark:bg-stone-800 dark:text-stone-100 dark:ring-stone-600 dark:hover:bg-stone-700';
  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${style}`}
    >
      {busy ? t('common.loading') : label}
    </button>
  );
}
