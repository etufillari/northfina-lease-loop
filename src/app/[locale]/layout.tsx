// The root layout. Every page lives under /[locale] (/en, /fi, /sv, /et), so the
// <html lang> attribute is always right for the page.
import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { AS_OF_COOKIE } from '@/components/as-of-cookie';
import { LanguageSwitcher } from '@/components/language-switcher';
import { PERSONA_COOKIE, STAFF_PERSONA } from '@/components/persona-cookie';
import { PersonaPicker } from '@/components/persona-picker';
import { TimeTravel } from '@/components/time-travel';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { todayIso } from '@/server/today';
import '../globals.css';

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: t('meta.title'), description: t('meta.description') };
}

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  const cookieStore = await cookies();
  const persona = cookieStore.get(PERSONA_COOKIE)?.value ?? null;
  const asOfCookie = cookieStore.get(AS_OF_COOKIE)?.value;
  const travelling = Boolean(asOfCookie && /^\d{4}-\d{2}-\d{2}$/.test(asOfCookie));

  return (
    <html lang={locale}>
      <body className="flex min-h-dvh flex-col bg-stone-50 text-stone-900 antialiased dark:bg-stone-950 dark:text-stone-100">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-10 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-stone-900 focus:shadow"
        >
          {t('nav.skipToContent')}
        </a>

        <header className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <Link href={`/${locale}`} className="flex items-center gap-3 rounded-lg">
              <LoopMark />
              <span>
                <span className="block text-lg font-semibold tracking-tight">
                  {t('brand.name')}
                </span>
                <span className="block text-sm text-stone-600 dark:text-stone-400">
                  {t('brand.tagline')}
                </span>
              </span>
            </Link>
            <div className="flex flex-wrap items-center gap-4">
              <TimeTravel
                locale={locale}
                current={travelling ? asOfCookie! : todayIso()}
                travelling={travelling}
              />
              {persona === STAFF_PERSONA ? (
                <Link
                  href={`/${locale}/second-life`}
                  className="text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                >
                  {t('secondLife.title')}
                </Link>
              ) : null}
              <Link
                href={`/${locale}/waitlist`}
                className="text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300"
              >
                {t('waitlist.title')}
              </Link>
              <PersonaPicker locale={locale} initialId={persona} />
              <LanguageSwitcher current={locale} label={t('nav.language')} />
            </div>
          </div>
        </header>

        <main id="main" className="flex-1">
          {children}
        </main>

        <footer className="border-t border-stone-200 dark:border-stone-800">
          <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-stone-600 sm:px-6 dark:text-stone-400">
            {t('footer.skeleton')}
          </div>
        </footer>
      </body>
    </html>
  );
}

/** Two arrows chasing each other: lease, return, lease again. */
function LoopMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      className="size-9 shrink-0 rounded-xl bg-emerald-700 p-1.5 text-white"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 13a9 9 0 0 1 15.5-4.5L26 11" />
      <path d="M26 5v6h-6" />
      <path d="M24 19a9 9 0 0 1-15.5 4.5L6 21" />
      <path d="M6 27v-6h6" />
    </svg>
  );
}
