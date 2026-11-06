'use client';

// One item held for someone on the waiting list. Releasing it puts it back in the catalogue
// for everyone, for when that person did not take it.
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import type { HeldItem } from '@/server/second-life/dealer-dashboard';

export function HeldItemCard({ item, locale }: { item: HeldItem; locale: Locale }) {
  const t = getT(locale);
  const router = useRouter();

  const [releasing, setReleasing] = useState(false);
  const [failed, setFailed] = useState(false);

  async function release() {
    setReleasing(true);
    setFailed(false);

    try {
      const response = await fetch(`/api/assets/${item.id}/release`, { method: 'POST' });
      if (!response.ok) throw new Error('release failed');
    } catch {
      setReleasing(false);
      setFailed(true);
    }

    // Also after a failure: someone else may have released it in the meantime.
    router.refresh();
  }

  return (
    <article className="rounded-2xl border border-stone-800 bg-stone-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-stone-100">
            {item.make} {item.model}
          </h3>
          <p className="mt-1 text-sm text-amber-300">
            {t('dealer.held.heldFor', { name: item.held_for_name })}
          </p>
          <p className="mt-1 font-mono text-xs text-stone-500">{item.id}</p>
        </div>

        <button
          type="button"
          onClick={() => void release()}
          disabled={releasing}
          className="rounded-xl border border-stone-700 px-5 py-2.5 text-sm font-medium text-stone-300 transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {releasing ? t('dealer.held.releasing') : t('dealer.held.release')}
        </button>
      </div>

      {failed && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {t('dealer.error')}
        </p>
      )}
    </article>
  );
}
