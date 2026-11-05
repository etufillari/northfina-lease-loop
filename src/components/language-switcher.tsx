'use client';

// Links to the same page in each language: /fi/anything?sort=price_asc → /en/anything?sort=price_asc.
// The query string is kept, so switching language keeps the catalogue filters.
// A client component only because it needs the current path and query.
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { localeNames, locales, type Locale } from '@/i18n/locales';

type LanguageSwitcherProps = { current: Locale; label: string };

export function LanguageSwitcher(props: LanguageSwitcherProps) {
  // useSearchParams needs a Suspense boundary; until it resolves, links keep the path only.
  return (
    <Suspense fallback={<LanguageLinks {...props} search="" />}>
      <LanguageLinksWithQuery {...props} />
    </Suspense>
  );
}

function LanguageLinksWithQuery(props: LanguageSwitcherProps) {
  const query = useSearchParams().toString();
  return <LanguageLinks {...props} search={query ? `?${query}` : ''} />;
}

function LanguageLinks({ current, label, search }: LanguageSwitcherProps & { search: string }) {
  const pathname = usePathname();
  const rest = pathname.split('/').slice(2).join('/');

  return (
    <nav aria-label={label}>
      <ul className="flex gap-1 rounded-full bg-stone-100 p-1 dark:bg-stone-800">
        {locales.map((locale) => {
          const active = locale === current;
          return (
            <li key={locale}>
              <Link
                href={(rest ? `/${locale}/${rest}` : `/${locale}`) + search}
                // Replace, don't push: Back then skips "same page in another language".
                replace
                hrefLang={locale}
                lang={locale}
                aria-current={active ? 'page' : undefined}
                className={
                  'block rounded-full px-3 py-1.5 text-sm font-medium uppercase transition-colors ' +
                  (active
                    ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-950 dark:text-white'
                    : 'text-stone-700 hover:text-stone-950 dark:text-stone-300 dark:hover:text-white')
                }
              >
                <span aria-hidden="true">{locale}</span>
                <span className="sr-only">{localeNames[locale]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
