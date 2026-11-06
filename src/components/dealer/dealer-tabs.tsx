'use client';

// The dealer's page switcher: Returns (the working queue) and Next month (the forecast).
// A client component only because it needs the current path to mark the open page.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Locale } from '@/i18n/locales';

type Props = {
  locale: Locale;
  label: string;
  tabs: { slug: 'returns' | 'forecast'; text: string }[];
};

export function DealerTabs({ locale, label, tabs }: Props) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={label}
      className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900"
    >
      <ul className="mx-auto flex max-w-6xl gap-1 px-4 sm:px-6">
        {tabs.map((tab) => {
          const href = `/${locale}/dealer/${tab.slug}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={tab.slug}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={
                  '-mb-px block border-b-2 px-4 py-3 text-sm font-medium transition-colors ' +
                  (active
                    ? 'border-emerald-700 text-emerald-800 dark:border-emerald-400 dark:text-emerald-300'
                    : 'border-transparent text-stone-700 hover:text-stone-950 dark:text-stone-300 dark:hover:text-white')
                }
              >
                {tab.text}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
