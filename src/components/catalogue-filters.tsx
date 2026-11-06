// Search box and the status and sort dropdowns (the category has its own tabs, see
// category-tabs.tsx). Every change is reported through
// `onChange` so the list updates live. The fields keep their `name`s, so the Search button
// submits a normal GET form (?q=&category=&status=&sort=) that the server understands too.
import { DEFAULT_PER_PAGE } from '@/domain/catalogue-pages';
import {
  catalogueSearchString,
  catalogueStatuses,
  catalogueSorts,
  defaultCatalogueQuery,
  MAX_SEARCH_LENGTH,
  parseCatalogueQuery,
  type CatalogueQuery,
} from '@/domain/catalogue';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type CatalogueFiltersProps = {
  query: CatalogueQuery;
  onChange: (next: CatalogueQuery) => void;
  /** Kept on Search, so the page size survives a reload. */
  perPage: number;
  locale: Locale;
  t: Translate;
};

const fieldClass =
  'mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/30 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100';

export function CatalogueFilters({ query, perPage, onChange, locale, t }: CatalogueFiltersProps) {
  // Dropdown values are strings; parsing them the same way as the URL keeps one set of rules.
  const set = (key: 'status' | 'sort', value: string) =>
    onChange({
      ...parseCatalogueQuery({
        category: query.category ?? undefined,
        status: query.status ?? undefined,
        sort: query.sort,
        [key]: value,
      }),
      search: query.search,
    });

  return (
    <section
      aria-label={t('filters.label')}
      className="mt-8 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 dark:border-stone-800 dark:bg-stone-900"
    >
      <form
        method="get"
        action={`/${locale}/catalogue`}
        role="search"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto] lg:items-end"
      >
        <label className="block text-sm font-medium">
          {t('filters.search')}
          <input
            type="search"
            name="q"
            value={query.search}
            // Not trimmed while typing, or the space between two words would vanish.
            onChange={(event) =>
              onChange({ ...query, search: event.target.value.slice(0, MAX_SEARCH_LENGTH) })
            }
            placeholder={t('filters.searchPlaceholder')}
            maxLength={MAX_SEARCH_LENGTH}
            className={fieldClass}
          />
        </label>

        {/* The category is picked with the tabs above the results; this keeps it on Search. */}
        {query.category ? <input type="hidden" name="category" value={query.category} /> : null}
        {perPage !== DEFAULT_PER_PAGE ? <input type="hidden" name="per" value={perPage} /> : null}

        <label className="block text-sm font-medium">
          {t('filters.status')}
          <select
            name="status"
            value={query.status ?? ''}
            onChange={(event) => set('status', event.target.value)}
            className={fieldClass}
          >
            <option value="">{t('filters.anyStatus')}</option>
            {catalogueStatuses.map((status) => (
              <option key={status} value={status}>
                {t(`status.${status}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium">
          {t('filters.sort')}
          <select
            name="sort"
            value={query.sort}
            onChange={(event) => set('sort', event.target.value)}
            className={fieldClass}
          >
            {catalogueSorts.map((sort) => (
              <option key={sort} value={sort}>
                {t(`sort.${sort}`)}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-stone-900"
          >
            {t('filters.submit')}
          </button>
          {catalogueSearchString(query) !== '' ? (
            <button
              type="button"
              onClick={() => onChange(defaultCatalogueQuery)}
              className="text-sm font-medium whitespace-nowrap text-emerald-800 underline underline-offset-4 hover:text-emerald-950 dark:text-emerald-300 dark:hover:text-emerald-100"
            >
              {t('filters.clear')}
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
