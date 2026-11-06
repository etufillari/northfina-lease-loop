'use client';

import { useState } from 'react';
import type { AssetCondition } from '@/data/schemas';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

const conditions: AssetCondition[] = ['new', 'like_new', 'good', 'fair', 'poor'];

type Props = { assetId: string; locale: Locale; today: string };
type ResponseBody = { success: true } | { success: false; error: { code: string } };

export function WishlistRequest({ assetId, locale, today }: Props) {
  const t = getT(locale);
  const [customerId, setCustomerId] = useState('');
  const [minimumCondition, setMinimumCondition] = useState<AssetCondition>('good');
  const [maxMonthlyRent, setMaxMonthlyRent] = useState('');
  const [preferredTermMonths, setPreferredTermMonths] = useState(24);
  const [neededBy, setNeededBy] = useState(today);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    setError(undefined);
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}/wishlist`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerId,
          minimumCondition,
          maxMonthlyNetRentCents: Number(maxMonthlyRent) * 100,
          preferredTermMonths,
          neededBy,
        }),
      });
      const body = (await response.json()) as ResponseBody;
      if (!response.ok || !body.success) {
        setError(
          body.success
            ? t('wishlist.error')
            : body.error.code === 'WISHLIST_REQUEST_ALREADY_OPEN'
              ? t('wishlist.alreadyRequested')
              : t('wishlist.error')
        );
        return;
      }
      setSubmitted(true);
    } catch {
      setError(t('wishlist.error'));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950">
        <h2 className="font-semibold">{t('wishlist.successTitle')}</h2>
        <p className="mt-1 text-stone-700 dark:text-stone-300">{t('wishlist.success')}</p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950">
      <h2 className="font-semibold">{t('wishlist.title')}</h2>
      <p className="mt-1 text-stone-700 dark:text-stone-300">{t('wishlist.description')}</p>
      <label className="mt-4 block text-sm font-medium" htmlFor="wishlist-customer">
        {t('wishlist.customerId')}
      </label>
      <input
        id="wishlist-customer"
        value={customerId}
        onChange={(event) => setCustomerId(event.target.value)}
        className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 dark:border-stone-700 dark:bg-stone-900"
      />
      <label className="mt-4 block text-sm font-medium" htmlFor="wishlist-condition">
        {t('wishlist.minimumCondition')}
      </label>
      <select
        id="wishlist-condition"
        value={minimumCondition}
        onChange={(event) => setMinimumCondition(event.target.value as AssetCondition)}
        className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 dark:border-stone-700 dark:bg-stone-900"
      >
        {conditions.map((condition) => (
          <option key={condition} value={condition}>
            {t(`condition.${condition}`)}
          </option>
        ))}
      </select>
      <label className="mt-4 block text-sm font-medium" htmlFor="wishlist-budget">
        {t('wishlist.maxMonthlyRent')}
      </label>
      <input
        id="wishlist-budget"
        type="number"
        min="1"
        step="1"
        value={maxMonthlyRent}
        onChange={(event) => setMaxMonthlyRent(event.target.value)}
        className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 dark:border-stone-700 dark:bg-stone-900"
      />
      <label className="mt-4 block text-sm font-medium" htmlFor="wishlist-term">
        {t('wishlist.term')}
      </label>
      <select
        id="wishlist-term"
        value={preferredTermMonths}
        onChange={(event) => setPreferredTermMonths(Number(event.target.value))}
        className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 dark:border-stone-700 dark:bg-stone-900"
      >
        {[12, 24, 36, 48].map((months) => (
          <option key={months} value={months}>
            {t('price.term.value', { months })}
          </option>
        ))}
      </select>
      <label className="mt-4 block text-sm font-medium" htmlFor="wishlist-needed-by">
        {t('wishlist.neededBy')}
      </label>
      <input
        id="wishlist-needed-by"
        type="date"
        min={today}
        value={neededBy}
        onChange={(event) => setNeededBy(event.target.value)}
        className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 dark:border-stone-700 dark:bg-stone-900"
      />
      {error ? <p className="mt-3 text-red-700 dark:text-red-300">{error}</p> : null}
      <button
        type="button"
        onClick={submit}
        disabled={
          isSubmitting || !customerId.trim() || !maxMonthlyRent || Number(maxMonthlyRent) <= 0
        }
        className="mt-5 rounded-xl bg-amber-700 px-5 py-3 font-medium text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? t('wishlist.submitting') : t('wishlist.submit')}
      </button>
    </section>
  );
}
