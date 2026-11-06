'use client';
// The demo's time machine, in the demo bar. It only moves forward: +1 day, +1 week, +1 month,
// or a jump to a LATER date (the picker's minimum is tomorrow and travel() refuses anything
// earlier). Contracts, invoices and offers are written on the day they happen, so going back
// would show a world that contradicts its own records. To replay a demo, "Reset"
// rebuilds the database from the data pack and starts again on the demo start date. The date
// lives in a cookie that every page and API route treats as "today" (?asOf= still wins).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addDays, addMonthsClamped } from '@/domain/calendar';
import { formatShortDate } from '@/i18n/format';
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

  // Moving the clock runs the overnight job for the days passed (holds that lapse end, offers
  // pass on), then the whole app re-renders on the new date.
  async function travel(iso: string) {
    if (iso <= current || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/demo/advance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ from: current, to: iso, actor: actor ?? 'demo' }),
      });
      const body = await response.json();
      if (!body.success) {
        window.alert(body.error?.message ?? t('common.error'));
        return;
      }
      setCookie(AS_OF_COOKIE, iso);
      router.refresh();
    } catch {
      window.alert(t('common.error'));
    } finally {
      setBusy(false);
    }
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
      <time dateTime={current} className="font-mono text-sm font-semibold">
        {formatShortDate(current, locale)}
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
      <form
        className="flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get('date');
          if (typeof value === 'string' && value) travel(value);
        }}
      >
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-amber-900 dark:text-amber-200">{t('demo.jumpTo')}</span>
          <input
            key={current}
            name="date"
            type="date"
            min={addDays(current, 1)}
            required
            disabled={busy}
            className="rounded-md border border-amber-300 bg-white px-1.5 py-0.5 text-sm tabular-nums dark:border-amber-700 dark:bg-stone-900"
          />
        </label>
        <button type="submit" className={step} disabled={busy}>
          {t('demo.go')}
        </button>
      </form>
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
