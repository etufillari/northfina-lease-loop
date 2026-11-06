'use client';
// Staff replace an asset's photo while refurbishing — after a new life the item may no
// longer look like the old picture. The file goes to public/images/assets/ via the API.
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

export function PhotoUpload({
  locale,
  assetId,
  personaId,
}: {
  locale: Locale;
  assetId: string;
  personaId: string | null;
}) {
  const t = getT(locale);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!personaId) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('actor', personaId);
      const response = await fetch(`/api/assets/${assetId}/image`, {
        method: 'POST',
        body: form,
      });
      const body = await response.json();
      if (body.success) router.refresh();
      else window.alert(body.error?.message ?? t('common.error'));
    } catch {
      window.alert(t('common.error'));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  if (!personaId) return null;
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-stone-900 ring-1 ring-stone-300 ring-inset hover:bg-stone-50 disabled:opacity-50 dark:bg-stone-800 dark:text-stone-100 dark:ring-stone-600 dark:hover:bg-stone-700"
      >
        {busy ? t('common.loading') : t('secondLife.uploadPhoto')}
      </button>
    </>
  );
}
