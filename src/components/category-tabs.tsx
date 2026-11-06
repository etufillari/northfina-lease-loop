// Category tabs above the catalogue's results: "All" plus one tab per category, each with how
// many items it would show under the other filters. Every tab is a real link to the filtered
// catalogue (so it works without JavaScript and can be opened in a new tab); with JavaScript the
// click is handled in place, like the other filters, so the list updates without a reload.
import Link from 'next/link';
import { assetCategorySchema, type Asset, type AssetCategory } from '@/data/schemas';
import { catalogueSearchString, type CatalogueQuery } from '@/domain/catalogue';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type CategoryTabsProps = {
  query: CatalogueQuery;
  /** Items matching every filter except the category, to count each tab. */
  matching: readonly Asset[];
  onChange: (next: CatalogueQuery) => void;
  locale: Locale;
  t: Translate;
};

export function CategoryTabs({ query, matching, onChange, locale, t }: CategoryTabsProps) {
  const tabs: { category: AssetCategory | null; label: string; count: number }[] = [
    { category: null, label: t('filters.allCategories'), count: matching.length },
    ...assetCategorySchema.options.map((category) => ({
      category,
      label: t(`category.${category}`),
      count: matching.filter((asset) => asset.category === category).length,
    })),
  ];

  return (
    <nav aria-label={t('filters.category')} className="mt-6">
      <ul className="flex flex-wrap gap-2">
        {tabs.map(({ category, label, count }) => {
          const active = query.category === category;
          const next = { ...query, category };
          return (
            <li key={category ?? 'all'}>
              <Link
                href={`/${locale}${catalogueSearchString(next)}`}
                aria-current={active ? 'true' : undefined}
                onClick={(event) => {
                  // Let modified clicks (new tab, new window) behave like a normal link.
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  onChange(next);
                }}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-stone-950 ${
                  active
                    ? 'border-emerald-700 bg-emerald-700 text-white'
                    : 'border-stone-300 bg-white text-stone-800 hover:border-emerald-600 hover:text-emerald-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:text-emerald-300'
                }`}
              >
                {label}
                <span
                  className={`rounded-full px-2 text-xs ${
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
                  }`}
                >
                  {count}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
