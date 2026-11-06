// The root layout. Every page lives under /[locale] (/en, /fi, /sv, /et), so the
// <html lang> attribute is always right for the page.
import type { Metadata } from 'next';
import { Fredoka, Nunito } from 'next/font/google';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LoopMark } from '@/components/loop-mark';
import { SiteHeader } from '@/components/site-header';
import { HashTargetFocus } from '@/components/ui';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { readActor } from '@/server/actor';
import { listCustomers } from '@/server/customers';
import { db } from '@/server/db';
import '../globals.css';

// The look's fonts (D21): Nunito for text and numbers, Fredoka for headings. next/font
// downloads them at build time and serves them from this app, so the browser makes no
// third-party request; globals.css falls back to system-ui. latin-ext covers å, ä, ö and õ.
const nunito = Nunito({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-nunito',
  display: 'swap',
});
const fredoka = Fredoka({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '600'],
  variable: '--font-fredoka',
  display: 'swap',
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
  // Read once per request here; pages that need the actor call readActor() themselves.
  const [customers, actor] = await Promise.all([listCustomers(db), readActor(db)]);

  return (
    <html lang={locale} className={`${nunito.variable} ${fredoka.variable}`}>
      <body className="flex min-h-dvh flex-col bg-surface font-sans text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-30 focus:rounded-md focus:bg-raised focus:px-4 focus:py-2 focus:text-ink focus:shadow"
        >
          {t('nav.skipToContent')}
        </a>

        <SiteHeader
          locale={locale}
          t={t}
          actor={actor}
          customers={customers.map(({ id, name }) => ({ id, name }))}
        />

        <main id="main" className="flex-1">
          {children}
        </main>
        <HashTargetFocus />

        <footer className="bg-brand text-brand-contrast">
          <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-6 px-4 py-10 sm:px-6">
            <div>
              <Link
                href={`/${locale}`}
                aria-label={t('brand.home')}
                className="inline-flex items-center gap-2.5 rounded-full font-heading text-xl font-semibold underline-offset-4 hover:underline"
              >
                <span className="rounded-full bg-raised p-1">
                  <LoopMark className="size-7" />
                </span>
                {t('brand.name')}
              </Link>
              <p className="mt-2 max-w-sm opacity-90">{t('brand.tagline')}</p>
            </div>
            <div className="flex max-w-sm flex-col items-start gap-4">
              <Link
                href={`/${locale}/catalogue`}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-raised px-5 font-bold text-brand-text transition-colors hover:bg-brand-soft"
              >
                {t('home.cta.catalogue')} <span aria-hidden="true">→</span>
              </Link>
              <p className="text-sm opacity-80">{t('footer.note')}</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
