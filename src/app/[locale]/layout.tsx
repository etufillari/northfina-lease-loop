// The root layout. Every page lives under /[locale] (/en, /fi, /sv, /et), so the
// <html lang> attribute is always right for the page.
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CustomerSwitcher } from '@/components/customer-switcher';
import { InvoiceBell } from '@/components/invoice-bell';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { TimeTravelBar } from '@/components/time-travel-bar';
import { loadCustomers } from '@/data/load';
import { parseTheme, THEME_COOKIE } from '@/domain/theme';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { appDate } from '@/server/app-date';
import { currentViewer } from '@/server/current-viewer';
import { db } from '@/server/db';
import { notificationsFor } from '@/server/notifications';
import { STAFF } from '@/server/viewer';
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
  const [date, viewer, customers] = await Promise.all([
    appDate(),
    currentViewer(),
    loadCustomers(),
  ]);
  // The bell: ended leases waiting for a choice, items passed on to this viewer, and unpaid
  // invoices, on the app's date.
  const { count: notificationCount } = await notificationsFor(db, viewer, date.today);
  // Light or dark from the header button; without a choice the device decides (globals.css).
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang={locale} data-theme={theme ?? undefined}>
      <body className="flex min-h-dvh flex-col bg-stone-50 text-stone-900 antialiased dark:bg-stone-950 dark:text-stone-100 print:bg-white print:text-black">
        <a
          href="#main"
          className="print:hidden sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-10 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-stone-900 focus:shadow"
        >
          {t('nav.skipToContent')}
        </a>

        <header className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 print:hidden">
          {/* One line on wide screens in every language: the tagline gives way ("…", full text on
              hover) instead of pushing the menu onto a second line. Below lg the menu takes its own
              full-width line and wraps inside it, so nothing runs off a phone screen. */}
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:flex-nowrap">
            <Link
              href={`/${locale}`}
              title={t('brand.tagline')}
              className="flex min-w-0 items-center gap-3 rounded-lg"
            >
              <LoopMark />
              <span className="min-w-0">
                <span className="block text-lg font-semibold tracking-tight">
                  {t('brand.name')}
                </span>
                <span className="block truncate text-sm text-stone-600 dark:text-stone-400">
                  {t('brand.tagline')}
                </span>
              </span>
            </Link>
            <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto lg:shrink-0 lg:flex-nowrap">
              <CustomerSwitcher
                customers={customers.map(({ id, name, type }) => ({ id, name, type }))}
                current={
                  viewer.kind === 'customer'
                    ? viewer.customer.id
                    : viewer.kind === 'staff'
                      ? STAFF
                      : ''
                }
                locale={locale}
              />
              <Link
                href={`/${locale}/catalogue`}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                {t('nav.catalogue')}
              </Link>
              <Link
                href={`/${locale}/contracts`}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                {t('nav.contracts')}
              </Link>
              <InvoiceBell
                count={notificationCount}
                href={`/${locale}/notifications`}
                label={t('nav.notifications', { count: notificationCount })}
              />
              <LanguageSwitcher current={locale} label={t('nav.language')} />
              <ThemeToggle chosen={theme} label={t('nav.darkMode')} />
            </div>
          </div>
        </header>
        <TimeTravelBar {...date} locale={locale} />

        <main id="main" className="flex-1">
          {children}
        </main>

        <footer className="border-t border-stone-200 dark:border-stone-800 print:hidden">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-stone-600 sm:px-6 dark:text-stone-400">
            <p>{t('footer.note')}</p>
            <Link
              href={`/${locale}/admin`}
              className="rounded-lg px-3 py-1.5 font-medium text-stone-700 ring-1 ring-stone-300 ring-inset hover:bg-stone-100 dark:text-stone-300 dark:ring-stone-700 dark:hover:bg-stone-800"
            >
              {t('nav.admin')}
            </Link>
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
