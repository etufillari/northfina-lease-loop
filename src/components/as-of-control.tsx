'use client';

// The demo "as of" date (D-030): pick the day the app treats as today, or go back to the real
// date. The server validates the date again and keeps it in a cookie; we only refresh the page.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { AS_OF_MAX, AS_OF_MIN } from '@/domain/as-of';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type Status = 'idle' | 'busy' | 'invalid' | 'error';

/**
 * Sets or clears the demo date. Once the server accepts it, the page refreshes, or `then` runs
 * instead (the demo panel's Run buttons open the page where a card starts, D-058).
 */
export function useAsOf(then?: () => void) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('idle');

  async function send(init: RequestInit) {
    setStatus('busy');
    const response = await fetch('/api/as-of', init).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      success: boolean;
      error?: { code: string };
    } | null;
    if (body?.success) {
      setStatus('idle');
      if (then) then();
      else router.refresh();
      return;
    }
    setStatus(body?.error?.code === 'INVALID_AS_OF_DATE' ? 'invalid' : 'error');
  }

  return {
    status,
    set: (date: string) =>
      send({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date }),
      }),
    clear: () => send({ method: 'DELETE' }),
  };
}

export function StatusMessage({ status, locale }: { status: Status; locale: Locale }) {
  const t = getT(locale);
  if (status === 'invalid') {
    return (
      <p role="alert" className="text-sm text-warn-fg">
        {t('asOf.invalid', {
          min: formatIsoDate(AS_OF_MIN, locale),
          max: formatIsoDate(AS_OF_MAX, locale),
        })}
      </p>
    );
  }
  if (status === 'error') {
    return (
      <p role="alert" className="text-sm text-warn-fg">
        {t('asOf.error')}
      </p>
    );
  }
  return null;
}

/** A small menu in the header: a date field and "Set". */
export function AsOfControl({ locale, date }: { locale: Locale; date: string }) {
  const t = getT(locale);
  const id = useId();
  const { status, set } = useAsOf();
  const [value, setValue] = useState(date);

  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-full px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg">
        {t('asOf.label')}
      </summary>
      <form
        className="panel absolute right-0 z-50 mt-2 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 p-4 shadow-lg"
        onSubmit={(event) => {
          event.preventDefault();
          void set(value);
        }}
      >
        <label htmlFor={id} className="eyebrow">
          {t('asOf.label')}
        </label>
        <input
          id={id}
          type="date"
          className="field"
          required
          min={AS_OF_MIN}
          max={AS_OF_MAX}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <p className="text-xs text-muted">{t('asOf.hint')}</p>
        <button type="submit" className="btn-primary" disabled={status === 'busy'}>
          {t('asOf.set')}
        </button>
        <StatusMessage status={status} locale={locale} />
      </form>
    </details>
  );
}

/** The "Back to today" button inside the demo banner. */
export function AsOfReset({ locale }: { locale: Locale }) {
  const t = getT(locale);
  const { status, clear } = useAsOf();
  return (
    <>
      <button
        type="button"
        className="btn-ghost px-3 py-1.5"
        disabled={status === 'busy'}
        onClick={() => void clear()}
      >
        {t('asOf.reset')}
      </button>
      <StatusMessage status={status} locale={locale} />
    </>
  );
}
