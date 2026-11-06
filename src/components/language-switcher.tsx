'use client';

// Links to the same page in each language: /fi/anything → /en/anything. The query goes along,
// so a language switch keeps what the customer picked. A client component because it needs the URL.
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { localeNames, locales, type Locale } from '@/i18n/locales';

type LanguageLinksProps = { current: Locale; label: string; query?: string };

export function LanguageSwitcher(props: { current: Locale; label: string }) {
  // On a prerendered page the query is only known in the browser: show plain links until then.
  return (
    <Suspense fallback={<LanguageLinks {...props} />}>
      <LanguageLinksWithQuery {...props} />
    </Suspense>
  );
}

function LanguageLinksWithQuery(props: { current: Locale; label: string }) {
  return <LanguageLinks {...props} query={useSearchParams().toString()} />;
}

function LanguageLinks({ current, label, query = '' }: LanguageLinksProps) {
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
                href={`${rest ? `/${locale}/${rest}` : `/${locale}`}${query ? `?${query}` : ''}`}
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
