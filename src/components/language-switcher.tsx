'use client';

// Links to the same page in each language: /fi/anything → /en/anything.
// A client component only because it needs the current path.
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { localeNames, locales, type Locale } from '@/i18n/locales';

export function LanguageSwitcher({ current, label }: { current: Locale; label: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rest = pathname.split('/').slice(2).join('/');
  const query = searchParams.toString();

  const languageHref = (locale: Locale) =>
    `${rest ? `/${locale}/${rest}` : `/${locale}`}${query ? `?${query}` : ''}`;

  return (
    <details className="relative" aria-label={label}>
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full bg-white px-3 py-2.5 text-sm font-medium uppercase text-slate-700 dark:bg-slate-800 dark:text-slate-100 shadow-sm ring-1 ring-slate-200 dark:ring-slate-600 transition-colors hover:text-[#101d46] dark:hover:text-white [&::-webkit-details-marker]:hidden">
        {current}
        <span aria-hidden="true" className="text-xs">
          ▾
        </span>
        <span className="sr-only">{localeNames[current]}</span>
      </summary>
      <ul className="absolute top-full right-0 z-30 mt-2 min-w-32 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-900">
        {locales
          .filter((locale) => locale !== current)
          .map((locale) => (
            <li key={locale}>
              <Link
                href={languageHref(locale)}
                hrefLang={locale}
                lang={locale}
                className="block rounded-lg px-3 py-2 text-sm font-medium uppercase text-slate-700 hover:bg-slate-100 hover:text-[#101d46] dark:text-slate-100 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <span aria-hidden="true">{locale}</span>
                <span className="sr-only">{localeNames[locale]}</span>
              </Link>
            </li>
          ))}
      </ul>
    </details>
  );
}
