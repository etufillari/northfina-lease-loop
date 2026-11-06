'use client';
// The buttons on one waiting-list entry: accept or decline an offer, or leave the queue.
// Accepting starts the normal application and goes straight to it.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type Action = 'accept' | 'decline' | 'leave';

export function EntryActions({
  locale,
  entryId,
  actor,
  actions,
  asOfParam,
}: {
  locale: Locale;
  entryId: string;
  actor: string;
  actions: Action[];
  asOfParam: string | null;
}) {
  const t = getT(locale);
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const suffix = asOfParam ? `?asOf=${asOfParam}` : '';

  async function run(action: Action) {
    if (action !== 'accept' && !window.confirm(t(`waitlist.confirm.${action}`))) return;
    setBusy(action);
    try {
      const response = await fetch(`/api/waitlist/${entryId}/${action}${suffix}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actor }),
      });
      const body = await response.json();
      if (!body.success) {
        window.alert(body.error?.message ?? t('common.error'));
      } else if (action === 'accept') {
        router.push(`/${locale}/apply/${body.data.applicationId}${suffix}`);
        return;
      } else {
        router.refresh();
      }
    } catch {
      window.alert(t('common.error'));
    }
    setBusy(null);
  }

  const style = {
    accept:
      'bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500',
    decline:
      'bg-white text-stone-900 ring-1 ring-stone-300 ring-inset hover:bg-stone-50 dark:bg-stone-800 dark:text-stone-100 dark:ring-stone-600',
    leave:
      'bg-white text-stone-900 ring-1 ring-stone-300 ring-inset hover:bg-stone-50 dark:bg-stone-800 dark:text-stone-100 dark:ring-stone-600',
  } as const;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <button
          key={action}
          type="button"
          disabled={busy !== null}
          onClick={() => run(action)}
          className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${style[action]}`}
        >
          {busy === action ? t('common.loading') : t(`waitlist.action.${action}`)}
        </button>
      ))}
    </div>
  );
}
