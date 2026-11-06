'use client';

// The two price controls. The lease term is a slider with a button for each offered term. The
// down payment is a slider and a field you can type into, always showing the same value: while
// typing, the price follows any value that is already valid; when the field loses focus (or on
// Enter) the text settles to the down payment snapped to the slider step inside its range.
// The rules live in src/domain/price-selection.ts.
import { useId, useState, type KeyboardEvent } from 'react';
import { formatEuro } from '@/domain/money';
import { parseEuroInput, snapDownPayment } from '@/domain/price-selection';
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

/**
 * The lease term: a slider plus one button per offered term. Only the terms in the coefficient
 * table can be priced, so there is nothing to type; the buttons are a quicker way to the same
 * stops as the slider.
 */
export function TermInput({ terms, termMonths, onChange, t }: TermInputProps) {
  const id = useId();
  const termIndex = Math.max(0, terms.indexOf(termMonths));

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span id={`${id}-label`} className="font-medium">
          {t('price.term')}
        </span>
        <span className="font-medium tabular-nums">
          {t('price.months', { months: termMonths })}
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
      <div role="group" aria-labelledby={`${id}-label`} className="mt-2 flex justify-between gap-2">
        {terms.map((months) => {
          const active = months === termMonths;
          return (
            <button
              key={months}
              type="button"
              aria-pressed={active}
              aria-label={t('price.months', { months })}
              onClick={() => onChange(months)}
              className={`min-w-11 rounded-full border px-3 py-1 text-sm font-medium tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-stone-900 ${
                active
                  ? 'border-emerald-700 bg-emerald-700 text-white'
                  : 'border-stone-300 bg-white text-stone-800 hover:border-emerald-600 hover:text-emerald-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:text-emerald-300'
              }`}
            >
              {months}
            </button>
          );
        })}
      </div>
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
