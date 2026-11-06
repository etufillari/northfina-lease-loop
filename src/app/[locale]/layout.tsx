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
  const asOf = asOfCookie && /^\d{4}-\d{2}-\d{2}$/.test(asOfCookie) ? asOfCookie : todayIso();

  return (
    // suppressHydrationWarning: browser extensions (e.g. Storylane) add classes to <html>
    // before React hydrates; the mismatch is theirs, not ours, and only this element's
    // attributes are exempted.
    <html lang={locale} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col bg-stone-50 text-stone-900 antialiased dark:bg-stone-950 dark:text-stone-100">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-10 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-stone-900 focus:shadow"
        >
          {t('nav.skipToContent')}
        </a>

        {/* Demo-only controls, kept apart from the product's own navigation. */}
        <aside
          aria-label={t('demo.label')}
          className="border-b border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 sm:px-6">
            <span className="rounded-full bg-amber-700 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-white uppercase">
              {t('demo.badge')}
            </span>
            <TimeTravel locale={locale} current={asOf} actor={persona} />
            <PersonaPicker key={persona ?? ''} locale={locale} initialId={persona} />
          </div>
        </aside>

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
              {persona ? (
                <Link
                  href={`/${locale}/${persona === STAFF_PERSONA ? 'staff' : 'me'}`}
                  className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
                >
                  {persona === STAFF_PERSONA ? t('persona.staffDesk') : t('persona.myPage')}
                </Link>
              ) : null}
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
  // The brand mark: an open loop with the "next life" dot in the gap, top right. The ring
  // follows the theme (near-black teal on light, off-white on dark); the dot stays mint.
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      className="size-9 shrink-0 text-[#1d3b33] dark:text-stone-100"
      fill="none"
    >
      <path
        d="M 28.14 8.55 A 16 16 0 1 0 39.45 19.86"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <circle cx="35.3" cy="12.7" r="4.5" fill="#34d399" />
    </svg>
  );
}
