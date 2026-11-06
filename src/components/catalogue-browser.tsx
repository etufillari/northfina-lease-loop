'use client';
// The interactive part of the catalogue: one category at a time (remembered per customer),
// a term picker that re-prices every card, and filters for budget, condition and model
// year. No money is computed here — the server priced every asset at every term.
import Link from 'next/link';
import { useState } from 'react';
import { AssetCard, CategoryIcon } from '@/components/asset-card';
import type { Asset, AssetCategory, AssetCondition } from '@/data/schemas';
import { euroInputToCents } from '@/domain/euro-input';
import { meetsMinCondition } from '@/domain/second-life';
import { getT, type MessageKey } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

export type CatalogueItem = {
  asset: Asset;
  imageUrl: string | null;
  secondLife: boolean;
  /** Term months → monthly rent with no down payment; null when not priceable. */
  monthly: Record<number, { netCents: number; grossCents: number } | null>;
};

const CATEGORIES: AssetCategory[] = ['e_bike', 'laptop', 'farm_machine'];
// No 'poor': nothing below fair is ever leased, so it is never a useful minimum.
const CONDITIONS: AssetCondition[] = ['fair', 'good', 'like_new', 'new'];

export function CatalogueBrowser({
  locale,
  items,
  terms,
  vatRatePercent,
  defaultCategory,
  personaId,
  asOfParam,
}: {
  locale: Locale;
  items: CatalogueItem[];
  terms: number[];
  vatRatePercent: number | null;
  defaultCategory: AssetCategory;
  personaId: string | null;
  asOfParam: string | null;
}) {
  const t = getT(locale);
  const [category, setCategory] = useState<AssetCategory>(defaultCategory);
  const [term, setTerm] = useState(terms.includes(48) ? 48 : (terms.at(-1) ?? 48));
  const [minEuro, setMinEuro] = useState('');
  const [maxEuro, setMaxEuro] = useState('');
  const [minCondition, setMinCondition] = useState<'any' | AssetCondition>('any');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');

  function pickCategory(next: AssetCategory) {
    setCategory(next);
    // Remembered on the customer, not in a cookie: a farmer is still a farmer next year.
    if (personaId) {
      void fetch(`/api/customers/${personaId}/preferred-category`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ category: next, actor: personaId }),
      }).catch(() => {});
    }
  }

  const minCents = euroInputToCents(minEuro);
  const maxCents = euroInputToCents(maxEuro);
  const filtered = items.filter(({ asset, monthly }) => {
    if (asset.category !== category) return false;
    const price = monthly[term] ?? null;
    if (minCents !== null || maxCents !== null) {
      if (price === null) return false;
      if (minCents !== null && price.grossCents < minCents) return false;
      if (maxCents !== null && price.grossCents > maxCents) return false;
    }
    if (minCondition !== 'any' && !meetsMinCondition(asset.condition, minCondition)) return false;
    const from = Number(yearFrom);
    const to = Number(yearTo);
    if (yearFrom !== '' && Number.isFinite(from) && asset.model_year < from) return false;
    if (yearTo !== '' && Number.isFinite(to) && asset.model_year > to) return false;
    return true;
  });

  const waitlistQuery = new URLSearchParams({ category });
  if (maxEuro !== '') waitlistQuery.set('maxBudget', maxEuro);
  if (minEuro !== '') waitlistQuery.set('minBudget', minEuro);
  if (minCondition !== 'any') waitlistQuery.set('minCondition', minCondition);
  waitlistQuery.set('term', String(term));
  if (asOfParam) waitlistQuery.set('asOf', asOfParam);

  const field =
    'mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900';

  return (
    <div className="mt-10">
      {/* ---- the category comes first: e-bikes by default ---------------------------- */}
      <div
        className="grid gap-3 sm:grid-cols-3"
        role="group"
        aria-label={t('catalogue.pickCategory')}
      >
        {CATEGORIES.map((c) => {
          const count = items.filter((i) => i.asset.category === c).length;
          const active = category === c;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={active}
              onClick={() => pickCategory(c)}
              className={`flex items-center gap-4 rounded-2xl border p-5 text-left transition-colors ${
                active
                  ? 'border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950'
                  : 'border-stone-200 bg-white hover:border-emerald-300 dark:border-stone-800 dark:bg-stone-900'
              }`}
            >
              <CategoryIcon category={c} className="size-14 shrink-0" />
              <span>
                <span className="block text-lg font-semibold">
                  {t(`category.${c}` as MessageKey)}
                </span>
                <span className="block text-sm text-stone-600 dark:text-stone-400">
                  {t('catalogue.itemCount', { count })}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ---- term + filters ----------------------------------------------------------- */}
      <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{t('catalogue.termLabel')}</span>
          {terms.map((months) => (
            <button
              key={months}
              type="button"
              aria-pressed={term === months}
              onClick={() => setTerm(months)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${
                term === months
                  ? 'bg-emerald-700 text-white ring-emerald-700'
                  : 'ring-stone-300 hover:bg-emerald-50 dark:ring-stone-700 dark:hover:bg-stone-800'
              }`}
            >
              {t('price.months', { months })}
            </button>
          ))}
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {t('catalogue.noDownPayment')}
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm font-medium">
            {t('catalogue.filter.monthlyMin')}
            <input
              className={field}
              inputMode="decimal"
              value={minEuro}
              onChange={(e) => setMinEuro(e.target.value)}
              placeholder="0"
            />
          </label>
          <label className="text-sm font-medium">
            {t('catalogue.filter.monthlyMax')}
            <input
              className={field}
              inputMode="decimal"
              value={maxEuro}
              onChange={(e) => setMaxEuro(e.target.value)}
              placeholder="500"
            />
          </label>
          <label className="text-sm font-medium">
            {t('catalogue.filter.condition')}
            <select
              className={field}
              value={minCondition}
              onChange={(e) => setMinCondition(e.target.value as 'any' | AssetCondition)}
            >
              <option value="any">{t('catalogue.filter.anyCondition')}</option>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {t(`condition.${c}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            {t('catalogue.filter.yearFrom')}
            <input
              className={field}
              type="number"
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value)}
              placeholder="2020"
            />
          </label>
          <label className="text-sm font-medium">
            {t('catalogue.filter.yearTo')}
            <input
              className={field}
              type="number"
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value)}
              placeholder="2026"
            />
          </label>
        </div>
      </div>

      {/* ---- the cards, or the way onto the waiting list ------------------------------ */}
      {filtered.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-stone-300 p-8 text-center dark:border-stone-700">
          <p className="text-lg font-medium">{t('catalogue.noMatches')}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-stone-600 dark:text-stone-400">
            {t('catalogue.noMatchesHint')}
          </p>
          <Link
            href={`/${locale}/waitlist?${waitlistQuery.toString()}`}
            className="mt-4 inline-block rounded-xl bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-800"
          >
            {t('catalogue.joinWaitlist')}
          </Link>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(({ asset, imageUrl, secondLife, monthly }) => (
            <li key={asset.id}>
              <Link
                href={`/${locale}/assets/${asset.id}${asOfParam ? `?asOf=${asOfParam}` : ''}`}
                className="block h-full rounded-2xl focus-visible:outline-2 focus-visible:outline-emerald-700"
              >
                <AssetCard
                  asset={asset}
                  imageUrl={imageUrl}
                  monthly={monthly[term] ?? null}
                  termMonths={term}
                  vatRatePercent={vatRatePercent}
                  secondLife={secondLife}
                  locale={locale}
                  t={t}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
