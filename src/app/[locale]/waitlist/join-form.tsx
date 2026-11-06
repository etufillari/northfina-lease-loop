'use client';
// Joining the second-life waiting list: what you need, what you can pay, and by when.
// The budget is typed in euros and sent as integer cents.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { euroInputToCents } from '@/domain/euro-input';
import { getT, type MessageKey } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

const CATEGORIES = ['e_bike', 'laptop', 'farm_machine'] as const;
const CONDITIONS = ['fair', 'good', 'like_new', 'new'] as const;
const TERMS = [12, 24, 36, 48] as const;

export function JoinForm({
  locale,
  customerId,
  asOf,
  asOfParam,
}: {
  locale: Locale;
  customerId: string;
  asOf: string;
  asOfParam: string | null;
}) {
  const t = getT(locale);
  const router = useRouter();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('e_bike');
  const [budget, setBudget] = useState('');
  const [minCondition, setMinCondition] = useState<(typeof CONDITIONS)[number]>('good');
  const [term, setTerm] = useState<(typeof TERMS)[number]>(24);
  const [neededBy, setNeededBy] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const cents = euroInputToCents(budget);
    if (cents === null) return setError(t('waitlist.join.badBudget'));
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
          maxMonthlyNetRentCents: cents,
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

  const field =
    'mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900';
  return (
    <form
      onSubmit={submit}
      className="mt-4 grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-2 dark:border-stone-800 dark:bg-stone-900"
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
      <label className="text-sm font-medium">
        {t('waitlist.join.budget')}
        <input
          className={field}
          inputMode="decimal"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="45"
          required
        />
      </label>
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
