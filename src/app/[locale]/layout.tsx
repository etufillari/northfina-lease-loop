// The root layout. Every page lives under /[locale] (/en, /fi, /sv, /et), so the
// <html lang> attribute is always right for the page.
import type { Metadata } from 'next';
import { Instrument_Sans, Unbounded } from 'next/font/google';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AsOfControl, AsOfReset } from '@/components/as-of-control';
import { LanguageSwitcher } from '@/components/language-switcher';
import { LoopMark } from '@/components/ui/loop-mark';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { asOf } from '@/server/as-of';
import '../globals.css';

// Self-hosted by next/font at build time: no request to Google from the browser.
// latin-ext covers Estonian and Finnish letters (õ, š, ž, ä, ö).
const body = Instrument_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-body',
  display: 'swap',
});
const display = Unbounded({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-unbounded',
  display: 'swap',
});

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  // Each page names itself; the brand follows (#34: every tab said "catalogue").
  return {
    title: { default: t('meta.title'), template: `%s · ${t('brand.name')}` },
    description: t('meta.description'),
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  const when = await asOf(); // the demo date, if one is set (D-030)

  return (
    <html lang={locale} className={`${body.variable} ${display.variable}`}>
      <body className="flex min-h-dvh flex-col bg-bg font-sans text-fg antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
        >
          {t('nav.skipToContent')}
        </a>

        <header className="z-40 border-b border-line bg-bg/90 backdrop-blur-lg sm:sticky sm:top-0">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
            <Link href={`/${locale}`} className="group flex items-center gap-3 rounded-full">
              <LoopMark className="size-9 transition-transform duration-500 group-hover:rotate-180" />
              <span className="font-display text-base font-bold tracking-tight uppercase">
                {t('brand.name')}
              </span>
            </Link>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <nav aria-label={t('nav.main')} className="flex gap-1 text-sm font-medium">
                <Link
                  href={`/${locale}`}
                  className="rounded-full px-3 py-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  {t('nav.catalogue')}
                </Link>
                {/* The demo panel (D-058) holds the scenario cards and links to the audit trail. */}
                <Link
                  href={`/${locale}/demo`}
                  className="rounded-full border border-accent px-3 py-1.5 font-semibold text-accent transition-colors hover:bg-accent hover:text-on-accent"
                >
                  {t('nav.demo')}
                </Link>
              </nav>
              <AsOfControl key={when.date} locale={locale} date={when.date} />
              <LanguageSwitcher current={locale} label={t('nav.language')} />
            </div>
          </div>
        </header>

        {when.isDemo ? (
          <div className="border-b border-warn-line bg-warn-bg text-warn-fg">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm sm:px-6">
              <p>
                <strong className="font-semibold">
                  {t('asOf.banner', { date: formatIsoDate(when.date, locale) })}
                </strong>{' '}
                {t('asOf.bannerReal', { date: formatIsoDate(when.realToday, locale) })}
              </p>
              <AsOfReset locale={locale} />
            </div>
          </div>
        ) : null}

        <main id="main" className="flex-1">
          {children}
        </main>

        <footer className="mt-16 border-t border-line">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:px-6">
            <p className="flex items-center gap-3">
              <LoopMark className="size-6" />
              {t('brand.tagline')}
            </p>
            <p>{t('footer.note')}</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
