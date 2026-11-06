'use client';

// The two price controls: a lease term and a down payment, each as a slider and a field you can
// type into. They always show the same value. While typing, the price follows any value that is
// already valid; when the field loses focus (or on Enter) the text is settled to a valid value:
// the nearest offered term, or the down payment snapped to the slider step inside its range.
// The rules live in src/domain/price-selection.ts.
import { useId, useState, type KeyboardEvent } from 'react';
import { formatEuro } from '@/domain/money';
import { nearestTerm, parseEuroInput, snapDownPayment } from '@/domain/price-selection';
import type { DownPaymentRange } from '@/domain/pricing';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

const fieldClass =
  'w-28 rounded-lg border border-stone-300 bg-white px-2 py-1 text-right text-sm tabular-nums text-stone-900 shadow-sm focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/30 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100';

const blurOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key === 'Enter') event.currentTarget.blur();
};

/**
 * What the field shows: the person's own text while it still belongs to the current value,
 * otherwise the current value (for example after the slider moved).
 */
function useDraft(value: number, format: (value: number) => string) {
  const [draft, setDraft] = useState<{ text: string; value: number } | null>(null);
  const text = draft && draft.value === value ? draft.text : format(value);
  return { text, setDraft };
}

type TermInputProps = {
  terms: readonly number[];
  termMonths: number;
  onChange: (months: number) => void;
  t: Translate;
};

export function TermInput({ terms, termMonths, onChange, t }: TermInputProps) {
  const id = useId();
  const { text, setDraft } = useDraft(termMonths, String);
  const termIndex = Math.max(0, terms.indexOf(termMonths));

  function type(next: string) {
    const months = Number(next.trim());
    const valid = /^\d+$/.test(next.trim()) && terms.includes(months);
    if (valid) onChange(months);
    setDraft({ text: next, value: valid ? months : termMonths });
  }

  function settle() {
    const months = Number(text.trim());
    const settled = /^\d+$/.test(text.trim()) ? nearestTerm(terms, months) : null;
    if (settled !== null && settled !== termMonths) onChange(settled);
    setDraft(null);
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between gap-4">
        <label id={`${id}-label`} htmlFor={`${id}-field`} className="text-sm font-medium">
          {t('price.term')}
        </label>
        <span className="flex items-center gap-2 text-sm">
          <input
            id={`${id}-field`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={text}
            onChange={(event) => type(event.target.value)}
            onBlur={settle}
            onKeyDown={blurOnEnter}
            className={fieldClass}
          />
          <span className="text-stone-600 dark:text-stone-400">{t('price.monthsUnit')}</span>
        </span>
      </div>
      <input
        type="range"
        aria-labelledby={`${id}-label`}
        min={0}
        max={terms.length - 1}
        step={1}
        value={termIndex}
        onChange={(event) => onChange(terms[Number(event.target.value)] ?? termMonths)}
        aria-valuetext={t('price.months', { months: termMonths })}
        className="mt-3 w-full accent-emerald-700"
      />
      <span
        aria-hidden="true"
        className="mt-1 flex justify-between text-xs text-stone-600 dark:text-stone-400"
      >
        {terms.map((months) => (
          <span key={months}>{months}</span>
        ))}
      </span>
    </div>
  );
}

type DownPaymentInputProps = {
  range: Extract<DownPaymentRange, { ok: true }>;
  downPaymentCents: number;
  onChange: (cents: number) => void;
  locale: Locale;
  t: Translate;
};

/** Cents as plain euros for the field: "20000", or "1234.50" when there are cents. */
const plainEuros = (cents: number) =>
  cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);

export function DownPaymentInput({
  range,
  downPaymentCents,
  onChange,
  locale,
  t,
}: DownPaymentInputProps) {
  const id = useId();
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const { text, setDraft } = useDraft(downPaymentCents, plainEuros);
  const fixed = range.minCents === range.maxCents;

  function type(next: string) {
    const cents = parseEuroInput(next);
    const inRange = cents !== null && cents >= range.minCents && cents <= range.maxCents;
    const value = inRange ? snapDownPayment(cents, range) : downPaymentCents;
    if (value !== downPaymentCents) onChange(value);
    setDraft({ text: next, value });
  }

  function settle() {
    const cents = parseEuroInput(text);
    if (cents !== null) {
      const settled = snapDownPayment(cents, range);
      if (settled !== downPaymentCents) onChange(settled);
    }
    setDraft(null);
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-4">
        <label id={`${id}-label`} htmlFor={`${id}-field`} className="text-sm font-medium">
          {t('price.downPayment')}
        </label>
        <span className="flex items-center gap-2 text-sm">
          <input
            id={`${id}-field`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            disabled={fixed}
            onChange={(event) => type(event.target.value)}
            onBlur={settle}
            onKeyDown={blurOnEnter}
            className={`${fieldClass} disabled:opacity-50`}
          />
          <span className="text-stone-600 dark:text-stone-400">€</span>
        </span>
      </div>
      <input
        type="range"
        aria-labelledby={`${id}-label`}
        min={range.minCents}
        max={range.maxCents}
        step={range.stepCents}
        value={downPaymentCents}
        disabled={fixed}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-valuetext={euro(downPaymentCents)}
        className="mt-3 w-full accent-emerald-700 disabled:opacity-50"
      />
      <span
        aria-hidden="true"
        className="mt-1 flex justify-between text-xs text-stone-600 dark:text-stone-400"
      >
        <span>{euro(range.minCents)}</span>
        <span>{euro(range.maxCents)}</span>
      </span>
    </div>
  );
}
