'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { localeNames, locales, type Locale } from '@/i18n/locales';

export function LanguageSwitcher({ current, label }: { current: Locale; label: string }) {
  const pathname = usePathname();
  const path = pathname.split('/').slice(2).join('/');

  return (
    <nav aria-label={label} className="flex gap-1 rounded-full bg-stone-100 p-1 dark:bg-stone-800">
      {locales.map((locale) => {
        const active = locale === current;

        return (
          <Link
            key={locale}
            href={`/${locale}${path ? `/${path}` : ''}`}
            hrefLang={locale}
            lang={locale}
            aria-current={active ? 'page' : undefined}
            aria-label={localeNames[locale]}
            className={`rounded-full px-2 py-1.5 text-xs font-medium uppercase transition-colors ${
              active
                ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-950 dark:text-white'
                : 'text-stone-700 hover:text-stone-950 dark:text-stone-300 dark:hover:text-white'
            }`}
          >
            {locale}
          </Link>
        );
      })}
    </nav>
  );
}
