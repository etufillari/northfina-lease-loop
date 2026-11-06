// The root layout. Every page lives under /[locale] (/en, /fi, /sv, /et), so the
// <html lang> attribute is always right for the page.
import type { Metadata } from 'next';
import Link from 'next/link';
import { Zalando_Sans_SemiExpanded } from 'next/font/google';
import { AppearanceSwitcher } from '@/components/appearance/appearance-switcher';
import { appearanceInit } from '@/components/appearance/preferences';
import { notFound } from 'next/navigation';
import { LanguageSwitcher } from '@/components/language-switcher';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import '../globals.css';
// Downloaded at build time and self-hosted; browsers do not contact a font service.
const northfinaFont = Zalando_Sans_SemiExpanded({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-northfina',
  display: 'swap',
  preload: false,
  // This family has no Next.js fallback metrics; retain the explicit CSS fallback.
  adjustFontFallback: false,
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
    <html lang={locale} data-design="green" data-mode="system" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceInit }} />
      </head>
      <body className={northfinaFont.variable + ' site-shell flex min-h-dvh flex-col antialiased'}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-10 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-stone-900 focus:shadow"
        >
          {t('nav.skipToContent')}
        </a>

        <header className="site-header">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <Link href={`/${locale}`} className="flex items-center gap-3 rounded-lg">
              <LoopMark />
              <span>
                <span className="block text-lg font-semibold tracking-tight">
                  {t('brand.name')}
                </span>
                <span className="brand-tagline ui-note block text-sm">{t('brand.tagline')}</span>
              </span>
            </Link>
            <div className="header-actions">
              <LanguageSwitcher current={locale} label={t('nav.language')} />
              <AppearanceSwitcher locale={locale} />
            </div>
          </div>
        </header>

        <main id="main" className="flex-1">
          {children}
        </main>

        <footer className="site-footer">
          <div className="footer-note ui-note mx-auto max-w-6xl px-4 py-6 text-sm sm:px-6">
            {t('spine.demo')}
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
      className="brand-mark size-9 shrink-0 rounded-xl p-1.5"
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
