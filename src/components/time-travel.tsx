'use client';
// The demo's time machine: a slider plus a date field in the nav bar. The chosen date goes
// into a cookie that every page and API route treats as "today" (an explicit ?asOf= in the
// URL still wins). Past dates matter as much as future ones: the scenario cards live on
// price list v1 days and either side of the VAT change.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { AS_OF_COOKIE } from './as-of-cookie';

// The data pack's world: price list v1 starts 2026-01-01; a 48-month lease signed late
// 2026 runs to 2030.
const RANGE_START = Date.UTC(2026, 0, 1);
const RANGE_END = Date.UTC(2030, 11, 31);
const DAY_MS = 86_400_000;
const TOTAL_DAYS = Math.round((RANGE_END - RANGE_START) / DAY_MS);

const toIso = (dayIndex: number) =>
  new Date(RANGE_START + dayIndex * DAY_MS).toISOString().slice(0, 10);
const toIndex = (iso: string) =>
  Math.min(TOTAL_DAYS, Math.max(0, Math.round((Date.parse(iso) - RANGE_START) / DAY_MS)));

function setAsOfCookie(iso: string | null) {
  document.cookie =
    iso === null
      ? `${AS_OF_COOKIE}=; path=/; max-age=0`
      : `${AS_OF_COOKIE}=${iso}; path=/; max-age=86400`;
}

export function TimeTravel({
  locale,
  current,
  travelling,
}: {
  locale: Locale;
  /** The resolved as-of date the server rendered with. */
  current: string;
  /** True when a time-travel cookie is active (shown amber as a reminder). */
  travelling: boolean;
}) {
  const t = getT(locale);
  const router = useRouter();
  const [value, setValue] = useState(current);
  // Follow the server's resolved date, so "Back to today" also snaps the slider and the
  // date field back instead of leaving them on the travelled date.
  const [seenCurrent, setSeenCurrent] = useState(current);
  if (current !== seenCurrent) {
    setSeenCurrent(current);
    setValue(current);
  }

  function travel(iso: string) {
    setValue(iso);
    setAsOfCookie(iso);
    router.refresh();
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-2 py-1 ring-1 ring-inset ${
        travelling
          ? 'bg-amber-50 ring-amber-300 dark:bg-amber-950 dark:ring-amber-700'
          : 'ring-stone-200 dark:ring-stone-700'
      }`}
    >
      <label className="flex items-center gap-2 text-sm">
        <span className="text-stone-600 dark:text-stone-400">{t('nav.timeTravel')}</span>
        <input
          type="range"
          min={0}
          max={TOTAL_DAYS}
          value={toIndex(value)}
          onChange={(event) => setValue(toIso(Number(event.target.value)))}
          onMouseUp={() => travel(value)}
          onTouchEnd={() => travel(value)}
          onKeyUp={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') travel(value);
          }}
          aria-valuetext={value}
          className="w-28 accent-emerald-700"
        />
      </label>
      <input
        type="date"
        value={value}
        min={toIso(0)}
        max={toIso(TOTAL_DAYS)}
        onChange={(event) => {
          if (event.target.value) travel(event.target.value);
        }}
        aria-label={t('nav.timeTravel')}
        className="rounded-md border border-stone-300 bg-white px-1.5 py-1 text-sm tabular-nums dark:border-stone-700 dark:bg-stone-900"
      />
      {travelling ? (
        <button
          type="button"
          onClick={() => {
            setAsOfCookie(null);
            router.refresh();
          }}
          className="text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300"
        >
          {t('nav.today')}
        </button>
      ) : null}
    </div>
  );
}
