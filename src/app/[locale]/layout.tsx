// The root layout. Every page lives under /[locale] (/en, /fi, /sv, /et), so the
// <html lang> attribute is always right for the page.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LanguageSwitcher } from '@/components/language-switcher';
import { DashboardSidebar } from '@/components/dashboard-sidebar';
import { companyModeActive } from '@/server/company-mode';
import { getActiveUser, listActiveUserOptions } from '@/server/active-user';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
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
  const activeUserData =
    process.env.NODE_ENV === 'development'
      ? await Promise.all([listActiveUserOptions(), getActiveUser()])
      : null;
  const companyMode = process.env.NODE_ENV === 'development' ? await companyModeActive() : false;

  return (
    <html lang={locale}>
      <body className="min-h-dvh bg-[#f3f6fa] text-slate-950 antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-10 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-stone-900 focus:shadow"
        >
          {t('nav.skipToContent')}
        </a>

        <DashboardSidebar
          locale={locale}
          activeUserData={activeUserData}
          companyMode={companyMode}
        />
        <div className="min-w-0 flex-1 lg:ml-64">
          <header className="border-b border-slate-200 bg-[#f3f6fa]">
            <div className="flex items-center gap-4 px-4 py-4 sm:px-8">
              <Link href={`/${locale}`} className="flex items-center gap-3 lg:hidden">
                <LoopMark />
                <span className="font-semibold">{t('brand.name')}</span>
              </Link>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <label className="relative min-w-0 max-w-xl flex-1">
                  <span className="sr-only">{t('nav.search')}</span>
                  <input
                    type="search"
                    placeholder={t('nav.searchPlaceholder')}
                    className="h-10 w-full rounded-full border border-slate-200 bg-white px-10 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-[#101d46] focus:ring-2 focus:ring-[#101d46]/15"
                  />
                  <span
                    aria-hidden="true"
                    className="absolute top-1/2 left-4 -translate-y-1/2 text-slate-400"
                  >
                    ⌕
                  </span>
                </label>
                <div className="ml-auto flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    aria-label={t('nav.messages')}
                    className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-[#101d46]"
                  >
                    <MessageIcon />
                  </button>
                  <button
                    type="button"
                    aria-label={t('nav.notifications')}
                    className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-[#101d46]"
                  >
                    <BellIcon />
                  </button>
                  <LanguageSwitcher current={locale} label={t('nav.language')} />
                </div>
              </div>
            </div>
          </header>
          <main id="main" className="min-h-[calc(100dvh-73px)]">
            {children}
          </main>
        </div>
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

function MessageIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
    >
      <path
        d="M5 5.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H11l-4.5 3v-3H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z"
        strokeWidth="1.7"
      />
      <path d="M7.5 10.5h9M7.5 13.5h5" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
    >
      <path
        d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}
