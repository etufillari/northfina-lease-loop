'use client';

// Links to the same page in each language: /fi/anything → /en/anything, the query kept.
// A client component only because it needs the current path. The query (the stored quote, the
// down payment, the catalogue filters) is read from the address bar when a link is clicked, so
// the header needs no `useSearchParams` and no Suspense boundary (review finding 14).
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';
import { localeHref, localeNames, locales, type Locale } from '@/i18n/locales';

export function LanguageSwitcher({ current, label }: { current: Locale; label: string }) {
  const pathname = usePathname();
  const router = useRouter();

  function keepQuery(event: MouseEvent<HTMLAnchorElement>, locale: Locale) {
    const search = window.location.search;
    // A new tab or window (a modifier or another button) keeps the plain link.
    const plain =
      event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    if (!plain || search === '') return;
    event.preventDefault();
    router.push(localeHref(pathname, locale, search));
  }

  return (
    <nav aria-label={label}>
      <ul className="flex gap-1 rounded-full bg-muted p-1">
        {locales.map((locale) => {
          const active = locale === current;
          return (
            <li key={locale}>
              <Link
                href={localeHref(pathname, locale)}
                onClick={(event) => keepQuery(event, locale)}
                hrefLang={locale}
                lang={locale}
                aria-current={active ? 'page' : undefined}
                className={
                  'block rounded-full px-3 py-1.5 text-sm font-medium uppercase transition-colors ' +
                  (active ? 'bg-raised text-ink shadow-sm' : 'text-ink-muted hover:text-ink')
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
