'use client';
// Carries out one desk decision. The server recomputes the decision; the button only says who
// pressed it (the persona) and on which day (the time-travel date).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

export function ExecuteButton({
  locale,
  assetId,
  personaId,
  asOfParam,
}: {
  locale: Locale;
  assetId: string;
  personaId: string | null;
  asOfParam: string | null;
}) {
  const t = getT(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function execute() {
    if (!personaId) return;
    setBusy(true);
    try {
      const suffix = asOfParam ? `?asOf=${asOfParam}` : '';
      const response = await fetch(`/api/second-life/${assetId}/execute${suffix}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actor: personaId }),
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
  return (
    <button
      type="button"
      onClick={execute}
      disabled={busy}
      className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
    >
      {busy ? t('common.loading') : t('secondLife.execute')}
    </button>
  );
}
