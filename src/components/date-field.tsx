'use client';
// A date field that is always day first. A browser's own <input type="date"> shows the date
// in the BROWSER's format (mm/dd/yyyy on a US browser), whatever language the page is in, so
// the customer types "dd.mm.yyyy" here instead (src/i18n/format.ts). The calendar button
// still opens the browser's picker for those who prefer clicking. The value going in and
// out is ISO ("2026-11-06"), or '' while what is typed is not a valid date in range.
import { useRef, useState } from 'react';
import { formatDateInput, formatIsoDate, parseDateInput } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

export function DateField({
  locale,
  value,
  onChange,
  id,
  name,
  min,
  max,
  required,
  disabled,
  ariaLabel,
  className = '',
}: {
  locale: Locale;
  /** ISO date, or '' for empty. */
  value: string;
  onChange: (iso: string) => void;
  id?: string;
  name?: string;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const t = getT(locale);
  const picker = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(formatDateInput(value));
  // Follow a value set from outside (a reset, a prefill) without fighting the typing.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== '' || parseDateInput(text) !== null) setText(formatDateInput(value));
  }

  const parsed = parseDateInput(text);
  const outOfRange = parsed !== null && ((min && parsed < min) || (max && parsed > max));
  const problem =
    text.trim() === ''
      ? null
      : parsed === null
        ? t('date.invalid')
        : outOfRange
          ? max && min
            ? t('date.between', {
                min: formatIsoDate(min, locale),
                max: formatIsoDate(max, locale),
              })
            : min
              ? t('date.from', { min: formatIsoDate(min, locale) })
              : t('date.until', { max: formatIsoDate(max!, locale) })
          : null;

  function accept(typed: string) {
    setText(typed);
    const iso = parseDateInput(typed);
    const ok = iso !== null && !(min && iso < min) && !(max && iso > max);
    const next = ok ? iso : '';
    setSeen(next);
    onChange(next);
  }

  return (
    <span className="block">
      <span className="relative flex items-stretch gap-1">
        <input
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={(event) => accept(event.target.value)}
          placeholder={t('date.placeholder')}
          required={required}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={problem !== null}
          className={`min-w-0 flex-1 tabular-nums ${className}`}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => picker.current?.showPicker?.()}
          aria-label={t('date.pick')}
          title={t('date.pick')}
          className="shrink-0 rounded-md px-2 text-stone-600 ring-1 ring-stone-300 ring-inset hover:bg-stone-50 disabled:opacity-50 dark:text-stone-300 dark:ring-stone-700 dark:hover:bg-stone-800"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="currentColor">
            <path d="M6 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1Zm-2 7v7h12V9H4Z" />
          </svg>
        </button>
        {/* The browser's picker, opened by the button; it never shows its own format. */}
        <input
          ref={picker}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={parsed ?? ''}
          min={min}
          max={max}
          onChange={(event) => {
            if (event.target.value) accept(formatDateInput(event.target.value));
          }}
          className="pointer-events-none absolute right-0 bottom-0 h-0 w-0 opacity-0"
        />
      </span>
      {problem ? (
        <span className="mt-1 block text-xs text-red-700 dark:text-red-400">{problem}</span>
      ) : null}
    </span>
  );
}
