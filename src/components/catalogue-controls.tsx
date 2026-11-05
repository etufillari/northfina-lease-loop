// The catalogue's category tabs and filter form. Server components with no JavaScript:
// the tabs are links and the filter is a plain GET form, so the URL holds the whole state.
import Link from 'next/link';
import type { AssetCategory } from '@/data/schemas';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type Values = { q: string; min: string; max: string };

function hrefFor(locale: Locale, category: AssetCategory, values: Values): string {
  const params = new URLSearchParams({ category });
  if (values.q) params.set('q', values.q);
  if (values.min) params.set('min', values.min);
  if (values.max) params.set('max', values.max);
  return `/${locale}?${params.toString()}`;
}

export function CategoryTabs({
  categories,
  active,
  counts,
  values,
  locale,
  t,
}: {
  categories: readonly AssetCategory[];
  active: AssetCategory;
  /** How many items each tab holds with the current filters applied. */
  counts: Record<AssetCategory, number>;
  values: Values;
  locale: Locale;
  t: Translate;
}) {
  return (
    <nav
      aria-label={t('catalogue.categories')}
      className="border-b border-stone-200 dark:border-stone-800"
    >
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {categories.map((category) => {
          const isActive = category === active;
          return (
            <li key={category}>
              <Link
                href={hrefFor(locale, category, values)}
                aria-current={isActive ? 'page' : undefined}
                className={
                  'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ' +
                  (isActive
                    ? 'border-emerald-700 text-emerald-800 dark:border-emerald-400 dark:text-emerald-300'
                    : 'border-transparent text-stone-700 hover:border-stone-300 hover:text-stone-950 dark:text-stone-300 dark:hover:border-stone-600 dark:hover:text-white')
                }
              >
                {t(`category.${category}`)}
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs tabular-nums text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                  {counts[category]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const inputClass =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm placeholder:text-stone-500 dark:border-stone-700 dark:bg-stone-900';

export function FilterForm({
  category,
  values,
  locale,
  t,
}: {
  category: AssetCategory;
  values: Values;
  locale: Locale;
  t: Translate;
}) {
  const active = values.q !== '' || values.min !== '' || values.max !== '';
  return (
    <form
      action={`/${locale}`}
      method="get"
      role="search"
      className="mt-6 grid gap-3 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end"
    >
      <input type="hidden" name="category" value={category} />
      <label className="block text-sm font-medium">
        {t('filter.search')}
        <input
          type="search"
          name="q"
          defaultValue={values.q}
          maxLength={100}
          placeholder={t('filter.searchPlaceholder')}
          className={`${inputClass} mt-1 font-normal`}
        />
      </label>
      <label className="block text-sm font-medium">
        {t('filter.minPrice')}
        <input
          type="text"
          name="min"
          inputMode="decimal"
          defaultValue={values.min}
          placeholder="0"
          className={`${inputClass} mt-1 font-normal tabular-nums`}
        />
      </label>
      <label className="block text-sm font-medium">
        {t('filter.maxPrice')}
        <input
          type="text"
          name="max"
          inputMode="decimal"
          defaultValue={values.max}
          className={`${inputClass} mt-1 font-normal tabular-nums`}
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {t('filter.apply')}
        </button>
        {active ? (
          <Link
            href={`/${locale}?category=${category}`}
            className="text-sm text-stone-700 underline dark:text-stone-300"
          >
            {t('filter.clear')}
          </Link>
        ) : null}
      </div>
    </form>
  );
}
