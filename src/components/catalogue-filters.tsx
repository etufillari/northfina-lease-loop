// Search, category, status and sort for the catalogue. A server component: filters live in
// the URL (a plain GET form and links), so they work without JavaScript and can be shared.
import Link from 'next/link';
import { assetCategorySchema, assetStatusSchema } from '@/data/schemas';
import { catalogueSearchString, catalogueSorts, type CatalogueQuery } from '@/domain/catalogue';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { AutoSubmitSelect } from './auto-submit-select';

type CatalogueFiltersProps = { query: CatalogueQuery; locale: Locale; t: Translate };

const fieldClass =
  'mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/30 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100';

export function CatalogueFilters({ query, locale, t }: CatalogueFiltersProps) {
  const href = (next: CatalogueQuery) => `/${locale}${catalogueSearchString(next)}`;
  const categories = [null, ...assetCategorySchema.options] as const;

  return (
    <section
      aria-label={t('filters.label')}
      className="mt-8 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 dark:border-stone-800 dark:bg-stone-900"
    >
      <nav aria-label={t('filters.category')}>
        <ul className="flex flex-wrap gap-2">
          {categories.map((category) => {
            const active = query.category === category;
            return (
              <li key={category ?? 'all'}>
                <Link
                  href={href({ ...query, category })}
                  aria-current={active ? 'page' : undefined}
                  className={
                    'block rounded-full px-4 py-1.5 text-sm font-medium ring-1 transition-colors ring-inset ' +
                    (active
                      ? 'bg-emerald-700 text-white ring-emerald-700'
                      : 'bg-white text-stone-700 ring-stone-300 hover:bg-stone-100 dark:bg-stone-950 dark:text-stone-300 dark:ring-stone-700 dark:hover:bg-stone-800')
                  }
                >
                  {category ? t(`category.${category}`) : t('filters.allCategories')}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <form
        method="get"
        action={`/${locale}`}
        role="search"
        className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto] lg:items-end"
      >
        {query.category ? <input type="hidden" name="category" value={query.category} /> : null}

        <label className="block text-sm font-medium">
          {t('filters.search')}
          <input
            type="search"
            name="q"
            defaultValue={query.search}
            placeholder={t('filters.searchPlaceholder')}
            maxLength={100}
            className={fieldClass}
          />
        </label>

        <label className="block text-sm font-medium">
          {t('filters.status')}
          <AutoSubmitSelect name="status" defaultValue={query.status ?? ''} className={fieldClass}>
            <option value="">{t('filters.anyStatus')}</option>
            {assetStatusSchema.options.map((status) => (
              <option key={status} value={status}>
                {t(`status.${status}`)}
              </option>
            ))}
          </AutoSubmitSelect>
        </label>

        <label className="block text-sm font-medium">
          {t('filters.sort')}
          <AutoSubmitSelect name="sort" defaultValue={query.sort} className={fieldClass}>
            {catalogueSorts.map((sort) => (
              <option key={sort} value={sort}>
                {t(`sort.${sort}`)}
              </option>
            ))}
          </AutoSubmitSelect>
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-stone-900"
          >
            {t('filters.apply')}
          </button>
          {catalogueSearchString(query) !== '' ? (
            <Link
              href={`/${locale}`}
              className="text-sm font-medium text-emerald-800 underline underline-offset-4 hover:text-emerald-950 dark:text-emerald-300 dark:hover:text-emerald-100"
            >
              {t('filters.clear')}
            </Link>
          ) : null}
        </div>
      </form>
    </section>
  );
}
