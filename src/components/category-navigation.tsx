import Link from 'next/link';
import { assetCategorySchema, type AssetCategory } from '@/data/schemas';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type CategoryNavigationProps = {
  locale: Locale;
  label: string;
  t: Translate;
};

export function CategoryNavigation({ locale, label, t }: CategoryNavigationProps) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-1 sm:gap-2 lg:flex-nowrap">
        {assetCategorySchema.options.map((category) => (
          <li key={category}>
            <Link
              href={`/${locale}/catalogue/${category}`}
              className="block whitespace-nowrap rounded-full px-2 py-1.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-950 sm:px-3 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-white"
            >
              {t(categoryMessageKey(category))}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function categoryMessageKey(category: AssetCategory) {
  return `category.${category}` as const;
}
