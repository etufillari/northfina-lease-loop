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
      <ul className="flex flex-wrap gap-2">
        {assetCategorySchema.options.map((category) => (
          <li key={category}>
            <Link
              href={`/${locale}/catalogue/${category}`}
              className="block rounded-full px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white"
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
