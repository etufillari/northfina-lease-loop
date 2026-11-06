'use client';

// Lets an admin choose the date the app runs on, to show a VAT change or the end of a lease
// live. The server checks the role. The page reloads afterwards, because prices, quotes and
// contracts all depend on the date, and some of them are fetched in the browser.
import { useEffect, useId, useState, type FormEvent } from 'react';

import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type AppDate = { date: string; is_demo: boolean };

async function saveDate(date: string | null): Promise<void> {
  const response = await fetch('/api/demo-date', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date }),
  });
  if (!response.ok) throw new Error('could not change the date');
}

export function DemoDateControl({ locale }: { locale: Locale }) {
  const t = getT(locale);
  const inputId = useId();

  const [applied, setApplied] = useState<AppDate | null>(null);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/demo-date')
      .then(async (response) => {
        const body = (await response.json()) as { data?: AppDate };
        if (!response.ok || !body.data) throw new Error('could not read the date');
        if (cancelled) return;

        setApplied(body.data);
        setDate(body.data.date);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function apply(next: string | null) {
    setBusy(true);
    setFailed(false);

    try {
      await saveDate(next);
      window.location.reload();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void apply(date);
  }

  const isDemo = applied?.is_demo ?? false;
  const canSet = !busy && date !== '' && date !== applied?.date;

  return (
    <form
      onSubmit={onSubmit}
      className={`flex flex-wrap items-center gap-2 rounded-xl border bg-stone-900 p-2 ${
        isDemo ? 'border-amber-800' : 'border-stone-800'
      }`}
    >
      <label
        htmlFor={inputId}
        className={`px-1 text-xs font-medium ${isDemo ? 'text-amber-300' : 'text-stone-400'}`}
      >
        {isDemo ? t('admin.demoDate.demo') : t('admin.demoDate.real')}
      </label>

      <input
        id={inputId}
        type="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        disabled={busy || applied === null}
        aria-invalid={failed || undefined}
        className="rounded-lg border border-stone-700 bg-stone-950 px-2 py-1.5 text-sm text-stone-100 outline-none [color-scheme:dark] focus:border-emerald-600 disabled:opacity-50"
      />

      <button
        type="submit"
        disabled={!canSet}
        className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-1.5 text-sm font-medium text-emerald-300 transition hover:bg-emerald-900/60 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t('admin.demoDate.apply')}
      </button>

      {isDemo && (
        <button
          type="button"
          onClick={() => void apply(null)}
          disabled={busy}
          className="rounded-lg border border-stone-700 px-3 py-1.5 text-sm font-medium text-stone-300 transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('admin.demoDate.reset')}
        </button>
      )}

      {failed && (
        <p role="alert" className="w-full px-1 text-xs text-red-400">
          {t('admin.demoDate.error')}
        </p>
      )}
    </form>
  );
}
