'use client';

// Time travel: move the app's date back and forth to see VAT changes on invoices, price list
// changes, and leases reaching their end. The date is a cookie in this browser only, so it
// never changes anyone else's view; the server reads it on every request (see app-date.ts).
import { useRouter } from 'next/navigation';
import { addDays, addMonths } from '@/domain/contract';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { SIMULATED_DATE_COOKIE } from '@/server/today';

type TimeTravelBarProps = { today: string; realToday: string; simulated: boolean; locale: Locale };

const buttonClass =
  'rounded-md px-2.5 py-1 text-sm font-medium ring-1 ring-inset ring-stone-300 hover:bg-white dark:ring-stone-600 dark:hover:bg-stone-800';

export function TimeTravelBar({ today, realToday, simulated, locale }: TimeTravelBarProps) {
  const t = getT(locale);
  const router = useRouter();

  function travelTo(date: string | null) {
    const value =
      date && date !== realToday
        ? `${SIMULATED_DATE_COOKIE}=${date}; path=/; samesite=lax`
        : `${SIMULATED_DATE_COOKIE}=; path=/; max-age=0; samesite=lax`;
    document.cookie = value;
    router.refresh(); // render the server pages again with the new date
  }

  return (
    <div
      className={
        'border-b text-stone-800 dark:text-stone-200 print:hidden ' +
        (simulated
          ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'
          : 'border-stone-200 bg-stone-100 dark:border-stone-800 dark:bg-stone-900')
      }
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
        <p className="mr-2 text-sm">
          <span className="font-semibold">
            {simulated ? t('timeTravel.on') : t('timeTravel.label')}
          </span>{' '}
          <time dateTime={today}>{formatIsoDate(today, locale)}</time>
        </p>
        <button
          type="button"
          onClick={() => travelTo(addMonths(today, -1))}
          className={buttonClass}
        >
          {t('timeTravel.minusMonth')}
        </button>
        <button type="button" onClick={() => travelTo(addDays(today, -1))} className={buttonClass}>
          {t('timeTravel.minusDay')}
        </button>
        <label className="sr-only" htmlFor="time-travel-date">
          {t('timeTravel.pick')}
        </label>
        <input
          id="time-travel-date"
          type="date"
          value={today}
          min="2000-01-01"
          max="2099-12-31"
          onChange={(event) => event.target.value && travelTo(event.target.value)}
          className="rounded-md border border-stone-300 bg-white px-2 py-0.5 text-sm dark:border-stone-600 dark:bg-stone-950"
        />
        <button type="button" onClick={() => travelTo(addDays(today, 1))} className={buttonClass}>
          {t('timeTravel.plusDay')}
        </button>
        <button type="button" onClick={() => travelTo(addMonths(today, 1))} className={buttonClass}>
          {t('timeTravel.plusMonth')}
        </button>
        {simulated ? (
          <button
            type="button"
            onClick={() => travelTo(null)}
            className="rounded-md bg-amber-700 px-2.5 py-1 text-sm font-semibold text-white hover:bg-amber-800"
          >
            {t('timeTravel.reset')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
