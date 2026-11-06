'use client';
// The demo's time machine, in the demo bar. It only moves forward, a day, a week or a month at
// a time (no date picker: a picked date is too easy to aim backwards). Contracts, invoices
// and offers are written on the day they happen, so going back would show a world that
// contradicts its own records. To replay a demo, "Reset"
// rebuilds the database from the data pack and starts again on the demo start date. The date
// lives in a cookie that every page and API route treats as "today" (?asOf= still wins).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addDays, addMonthsClamped } from '@/domain/calendar';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { AS_OF_COOKIE } from './as-of-cookie';
import { PERSONA_COOKIE, STAFF_PERSONA } from './persona-cookie';

/** Long enough to outlast a demo day: an expired cookie would jump back to the real date. */
const COOKIE_MAX_AGE_SECONDS = 30 * 86_400;

// Outside the component on purpose: writing document.cookie inside one trips the
// react-hooks immutability rule.
function setCookie(name: string, value: string | null) {
  document.cookie =
    value === null
      ? `${name}=; path=/; max-age=0`
      : `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}`;
}

export function TimeTravel({
  locale,
  current,
  actor,
}: {
  locale: Locale;
  /** The resolved as-of date the server rendered with. */
  current: string;
  /** The persona, written as the actor of a reset. */
  actor: string | null;
}) {
  const t = getT(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  function travel(iso: string) {
    if (iso <= current) return;
    setCookie(AS_OF_COOKIE, iso);
    router.refresh();
  }

  async function reset() {
    if (!window.confirm(t('demo.confirmReset'))) return;
    setBusy(true);
    try {
      const response = await fetch('/api/demo/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actor: actor ?? 'demo' }),
      });
      const body = await response.json();
      if (!body.success) {
        window.alert(body.error?.message ?? t('common.error'));
        return;
      }
      setCookie(AS_OF_COOKIE, body.data.startDate);
      // Customers added during the demo are gone after a reset.
      if (actor && actor !== STAFF_PERSONA && !body.data.customerIds.includes(actor)) {
        setCookie(PERSONA_COOKIE, null);
      }
      router.refresh();
    } catch {
      window.alert(t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  const step =
    'rounded-md px-2.5 py-1 text-sm font-medium ring-1 ring-amber-300 ring-inset hover:bg-amber-100 disabled:opacity-50 dark:ring-amber-700 dark:hover:bg-amber-900';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-amber-900 dark:text-amber-200">{t('nav.timeTravel')}</span>
      <time dateTime={current} className="text-sm font-semibold tabular-nums">
        {formatIsoDate(current, locale)}
      </time>
      <div role="group" aria-label={t('demo.forward')} className="flex gap-1">
        <button
          type="button"
          className={step}
          disabled={busy}
          onClick={() => travel(addDays(current, 1))}
        >
          {t('demo.plusDay')}
        </button>
        <button
          type="button"
          className={step}
          disabled={busy}
          onClick={() => travel(addDays(current, 7))}
        >
          {t('demo.plusWeek')}
        </button>
        <button
          type="button"
          className={step}
          disabled={busy}
          onClick={() => travel(addMonthsClamped(current, 1))}
        >
          {t('demo.plusMonth')}
        </button>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={reset}
        className="rounded-md bg-amber-700 px-2.5 py-1 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
      >
        {busy ? t('common.loading') : t('demo.reset')}
      </button>
    </div>
  );
}
