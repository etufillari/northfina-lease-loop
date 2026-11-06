'use client';
// Joining the second-life waiting list: what you need, what you can pay (a monthly range),
// and by when. Budgets are typed in euros and sent as integer cents; an absurdly large
// number is clamped to the cap instead of erroring. The catalogue's "no matches" prompt
// prefills this form through the URL.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { euroInputToCentsClamped } from '@/domain/euro-input';
import { getT, type MessageKey } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

const CATEGORIES = ['e_bike', 'laptop', 'farm_machine'] as const;
const CONDITIONS = ['fair', 'good', 'like_new', 'new'] as const;
const TERMS = [12, 24, 36, 48] as const;

/** The API cap (€100,000 / month in cents): larger budgets are saved as this. */
const MAX_BUDGET_CENTS = 10_000_000;

export type JoinPrefill = {
  category?: string;
  minBudget?: string;
  maxBudget?: string;
  minCondition?: string;
  term?: string;
};

function pick<T extends readonly (string | number)[]>(
  options: T,
  value: string | number | undefined,
  fallback: T[number]
): T[number] {
  return value !== undefined && (options as readonly (string | number)[]).includes(value)
    ? (value as T[number])
    : fallback;
}

export function JoinForm({
  locale,
  customerId,
  asOf,
  asOfParam,
  prefill = {},
}: {
  locale: Locale;
  customerId: string;
  asOf: string;
  asOfParam: string | null;
  prefill?: JoinPrefill;
}) {
  const t = getT(locale);
  const router = useRouter();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>(
    pick(CATEGORIES, prefill.category, 'e_bike')
  );
  const [minBudget, setMinBudget] = useState(prefill.minBudget ?? '');
  const [budget, setBudget] = useState(prefill.maxBudget ?? '');
  const [minCondition, setMinCondition] = useState<(typeof CONDITIONS)[number]>(
    pick(CONDITIONS, prefill.minCondition, 'good')
  );
  const [term, setTerm] = useState<(typeof TERMS)[number]>(
    pick(TERMS, prefill.term === undefined ? undefined : Number(prefill.term), 24)
  );
  const [neededBy, setNeededBy] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const maxCents = euroInputToCentsClamped(budget, MAX_BUDGET_CENTS);
    if (maxCents === null) return setError(t('waitlist.join.badBudget'));
    const minCents =
      minBudget.trim() === '' ? 0 : euroInputToCentsClamped(minBudget, MAX_BUDGET_CENTS);
    if (minCents === null) return setError(t('waitlist.join.badBudget'));
    if (minCents > maxCents) return setError(t('waitlist.join.badRange'));
    if (!neededBy) return setError(t('waitlist.join.badDate'));
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/waitlist${asOfParam ? `?asOf=${asOfParam}` : ''}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerId,
          category,
          maxMonthlyNetRentCents: maxCents,
          minMonthlyNetRentCents: minCents,
          minCondition,
          preferredTermMonths: term,
          neededBy,
          quantity,
          actor: customerId,
        }),
      });
      const body = await response.json();
      if (body.success) {
        setBudget('');
        setMinBudget('');
        setNeededBy('');
        router.refresh();
      } else {
        setError(body.error?.message ?? t('common.error'));
      }
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  // One fixed height for selects and inputs, and every field's label on a single line above
  // it, so the fields of each row line up.
  const field =
    'mt-1 block h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm dark:border-stone-700 dark:bg-stone-900';
  const caption = 'mt-1 block text-xs font-normal text-stone-500 dark:text-stone-400';
  return (
    <form
      onSubmit={submit}
      className="mt-4 grid items-start gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-2 dark:border-stone-800 dark:bg-stone-900"
    >
      <label className="text-sm font-medium">
        {t('waitlist.join.category')}
        <select
          className={field}
          value={category}
          onChange={(e) => setCategory(e.target.value as typeof category)}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`category.${c}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="text-sm">
        <legend className="font-medium">{t('waitlist.join.budget')}</legend>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <input
              className={field}
              inputMode="decimal"
              value={minBudget}
              onChange={(e) => setMinBudget(e.target.value)}
              placeholder="0"
            />
            <span className={caption}>{t('waitlist.join.budgetMin')}</span>
          </label>
          <label>
            <input
              className={field}
              inputMode="decimal"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="45"
              required
            />
            <span className={caption}>{t('waitlist.join.budgetMax')}</span>
          </label>
        </div>
      </fieldset>
      <label className="text-sm font-medium">
        {t('waitlist.join.minCondition')}
        <select
          className={field}
          value={minCondition}
          onChange={(e) => setMinCondition(e.target.value as typeof minCondition)}
        >
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {t(`condition.${c}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        {t('waitlist.join.term')}
        <select
          className={field}
          value={term}
          onChange={(e) => setTerm(Number(e.target.value) as typeof term)}
        >
          {TERMS.map((months) => (
            <option key={months} value={months}>
              {t('price.months', { months })}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        {t('waitlist.join.neededBy')}
        <input
          className={field}
          type="date"
          min={asOf}
          value={neededBy}
          onChange={(e) => setNeededBy(e.target.value)}
          required
        />
      </label>
      <label className="text-sm font-medium">
        {t('waitlist.join.quantity')}
        <input
          className={field}
          type="number"
          min={1}
          max={10}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          {busy ? t('common.loading') : t('waitlist.join.submit')}
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
