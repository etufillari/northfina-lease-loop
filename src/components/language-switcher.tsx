'use client';

// A globe button that opens the language list. It is a real <select> laid invisibly over the
// globe and the current code, so keyboard, screen readers and phone pickers all work the
// native way. Choosing a language opens the same page (and query, e.g. ?asOf=) in it.
import { usePathname, useRouter } from 'next/navigation';
import { isLocale, localeNames, locales, type Locale } from '@/i18n/locales';

export function LanguageSwitcher({ current, label }: { current: Locale; label: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const rest = pathname.split('/').slice(2).join('/');

  function choose(value: string) {
    if (!isLocale(value) || value === current) return;
    const path = rest ? `/${value}/${rest}` : `/${value}`;
    router.push(`${path}${window.location.search}`);
  }

  return (
    <div className="relative inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-800 focus-within:ring-2 focus-within:ring-emerald-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700">
      <GlobeIcon />
      <span aria-hidden="true" className="uppercase">
        {current}
      </span>
      <ChevronIcon />
      <select
        aria-label={label}
        value={current}
        onChange={(event) => choose(event.target.value)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {locales.map((locale) => (
          <option key={locale} value={locale} lang={locale}>
            {localeNames[locale]}
          </option>
        ))}
      </select>
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-3.5 opacity-70"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 8 5 5 5-5" />
    </svg>
  );
}
