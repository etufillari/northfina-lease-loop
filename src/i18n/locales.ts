// The languages the app speaks. The first segment of every page URL is one of these: /en, /fi, ...
export const locales = ['en', 'fi', 'sv', 'et'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** Each language's name in that language, for the language switcher. */
export const localeNames: Record<Locale, string> = {
  en: 'English',
  fi: 'Suomi',
  sv: 'Svenska',
  et: 'Eesti',
};

/** Locale tag for Intl (dates, numbers, money). Swedish uses the Finland-Swedish variant. */
export const intlLocale: Record<Locale, string> = {
  en: 'en-GB',
  fi: 'fi-FI',
  sv: 'sv-FI',
  et: 'et-EE',
};

/**
 * The same page in `locale`: `/fi/assets/x` + `?quote=…` → `/en/assets/x?quote=…`. The query
 * (the stored quote, the down payment, the catalogue filters) is kept (review finding 14).
 */
export function localeHref(pathname: string, locale: Locale, search = ''): string {
  const rest = pathname.split('/').slice(2).join('/');
  const query =
    search === '' || search === '?' ? '' : search.startsWith('?') ? search : `?${search}`;
  return `${rest ? `/${locale}/${rest}` : `/${locale}`}${query}`;
}
