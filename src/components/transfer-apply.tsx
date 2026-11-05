'use client';
// The take-over apply button: starts the normal question flow against the locked lease.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

export function TransferApply({
  locale,
  token,
  personaId,
  asOf,
}: {
  locale: Locale;
  token: string;
  personaId: string | null;
  asOf: string;
}) {
  const t = getT(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function apply() {
    if (!personaId || busy) return;
    setBusy(true);
    const response = await fetch(`/api/transfers/${token}/apply?asOf=${asOf}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customerId: personaId, actor: personaId }),
    });
    const body = await response.json();
    setBusy(false);
    if (body.success) router.push(`/${locale}/apply/${body.data.applicationId}`);
    else window.alert(body.error?.message ?? t('common.error'));
  }

  if (!personaId) {
    return <p className="text-sm text-stone-600 dark:text-stone-400">{t('asset.choosePersona')}</p>;
  }
  return (
    <button
      type="button"
      onClick={apply}
      disabled={busy}
      className="rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
    >
      {t('transfer.apply')}
    </button>
  );
}
