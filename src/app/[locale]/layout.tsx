// The root layout. Every page lives under /[locale] (/en, /fi, /sv, /et), so the
// <html lang> attribute is always right for the page.
import type { Metadata } from 'next';
import { Zalando_Sans_SemiExpanded } from 'next/font/google';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LanguageSwitcher } from '@/components/language-switcher';
import { SiteFooter } from '@/components/site-footer';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import '../globals.css';

// Self-hosted by next/font. latin-ext covers the š and ž in Estonian.
const zalando = Zalando_Sans_SemiExpanded({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-zalando',
});

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

  return (
    <html lang={locale} className={zalando.variable}>
      <body className="flex min-h-dvh flex-col bg-white font-sans text-ink-900 antialiased dark:bg-ink-950 dark:text-ink-100">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-10 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-ink-900 focus:shadow"
        >
          {t('nav.skipToContent')}
        </a>

        <header className="border-b border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
          <div className="flex w-full flex-wrap items-center justify-between gap-4 px-4 py-4 lg:flex-nowrap">
            <Link href={`/${locale}`} className="flex min-w-0 items-center gap-3 rounded-lg">
              <LoopMark />
              <span className="min-w-0">
                <span className="block text-lg font-semibold tracking-tight">
                  {t('brand.name')}
                </span>
                <span className="block truncate text-sm text-ink-600 dark:text-ink-400">
                  {t('brand.tagline')}
                </span>
              </span>
            </Link>
            <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-end lg:shrink-0">
              <Link
                href={`/${locale}/leases`}
                className="rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-950 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-white"
              >
                {t('nav.myLeases')}
              </Link>
              <Link
                href={`/${locale}/second-life`}
                className="rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-950 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-white"
              >
                {t('nav.secondLife')}
              </Link>
              <LanguageSwitcher current={locale} label={t('nav.language')} />
            </div>
          </div>
        </header>

        <main id="main" className="flex-1">
          {children}
        </main>

        <SiteFooter locale={locale} t={t} />
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
      className="brand-gradient size-9 shrink-0 rounded-xl p-1.5"
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
