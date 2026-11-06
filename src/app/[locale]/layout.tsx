// The root layout. Every page lives under /[locale] (/en, /fi, /sv, /et), so the
// <html lang> attribute is always right for the page.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { AccountNavigation } from '@/components/account-navigation';
import { BrandWordmark } from '@/components/brand-wordmark';
import { DemoBar } from '@/components/demo-bar';
import { UiIcon } from '@/components/ui-icon';
import { DEMO_DATE_MAX, DEMO_DATE_MIN } from '@/domain/demo';
import { getT, type MessageKey } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { readIdentity } from '@/server/auth-session';
import { db } from '@/server/db';
import { authSettings } from '@/server/auth-config';
import type { AccountIdentity } from '@/server/auth-session';
import { DEMO_STAFF, demoPersonas } from '@/server/demo-actions';
import { CURRENT_USER_ID, isPersonaAccount, ownAccount } from '@/server/demo-own-account';
import { appToday, demoModeEnabled } from '@/server/demo-mode';
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
  const requestHeaders = await headers();
  const identity = await readIdentity(db, requestHeaders);
  const demo = demoModeEnabled()
    ? await demoControls(locale, identity, requestHeaders.get('cookie'))
    : null;

  return (
    <html lang={locale}>
      <body className="flex min-h-dvh flex-col bg-canvas font-sans text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:flex focus:min-h-target focus:items-center focus:rounded-sm focus:bg-canvas focus:px-4 focus:text-primary"
        >
          {t('nav.skipToContent')}
        </a>

        {demo ? (
          <div className="print:hidden">
            <DemoBar {...demo} />
          </div>
        ) : null}
        <header className="sticky top-0 print:hidden z-20 border-b border-hairline bg-canvas/95 backdrop-blur-xl">
          <div>
            <div className="mx-auto flex min-h-18 max-w-[1200px] items-center justify-between gap-x-3 px-4 sm:px-6">
              <Link
                href={`/${locale}`}
                className="pressable flex min-h-target items-center gap-2.5 rounded-sm text-primary"
              >
                <BrandWordmark
                  label={t('brand.name')}
                  className="text-[1.25rem] sm:text-[1.5rem]"
                />
              </Link>
              <AccountNavigation
                locale={locale}
                accountLabel={t('nav.account')}
                languageLabel={t('nav.language')}
                staff={identity?.role === 'staff'}
              />
            </div>
          </div>
          <nav aria-label={t('nav.categories')} className="border-t border-divider">
            <div className="mx-auto flex max-w-[1200px] items-center gap-1 overflow-x-auto px-4 py-1 sm:gap-4 sm:px-6">
              {(
                [
                  ['e_bike', 'bike'],
                  ['laptop', 'laptop'],
                  ['farm_machine', 'tractor'],
                ] as const
              ).map(([category, icon]) => (
                <Link
                  key={category}
                  href={`/${locale}#category-${category}`}
                  className="flex min-h-target shrink-0 items-center gap-2 rounded-pill px-3 text-caption text-ink-muted hover:bg-parchment hover:text-ink focus-visible:bg-parchment"
                >
                  <UiIcon name={icon} className="size-4" />
                  {t(`category.${category}`)}
                </Link>
              ))}
            </div>
          </nav>
        </header>

        <main id="main" tabIndex={-1} className="flex-1">
          {children}
        </main>

        {identity?.role === 'staff' ? (
          <Link
            href={`/${locale}/staff`}
            className="pressable fixed right-5 bottom-5 print:hidden z-40 inline-flex min-h-target items-center gap-2 rounded-pill border border-hairline bg-ink px-5 py-3 text-caption font-semibold text-white shadow-lg"
          >
            <UiIcon name="settings" className="size-4" />
            {t('flow.admin')}
          </Link>
        ) : null}
        <footer className="bg-parchment text-ink-muted print:hidden">
          <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-3 gap-y-1 px-card py-5 text-caption">
            <BrandWordmark label={t('brand.name')} className="text-[1rem]" />
            <p>{t('brand.tagline')}</p>
          </div>
        </footer>
      </body>
    </html>
  );
}

/** Props for the demo bar: today's demo date, the personas, and translated labels. */
async function demoControls(
  locale: Parameters<typeof getT>[0],
  identity: AccountIdentity | null,
  cookieHeader: string | null
) {
  const t = getT(locale);
  const customerId = identity?.customerId;
  const [date, personas, own] = await Promise.all([
    appToday(),
    demoPersonas(),
    ownAccount(db, cookieHeader, authSettings()),
  ]);
  // "Current user": the visitor's own account, when signed in as it or kept from before a switch.
  const self = identity && !isPersonaAccount(identity.customerId, personas) ? identity : null;
  const ownName = self?.name ?? own?.identity.name;
  return {
    date,
    demoDateActive: date !== todayIso(),
    min: DEMO_DATE_MIN,
    max: DEMO_DATE_MAX,
    personas: [
      ...(ownName
        ? [{ id: CURRENT_USER_ID, label: t('demo.currentUser', { name: ownName }) }]
        : []),
      ...personas.map((persona) => ({
        id: persona.id,
        label: persona.staff
          ? t('demo.staff')
          : `${persona.name} · ${t(`application.option.${persona.type}` as MessageKey)}`,
      })),
    ],
    currentPersonaId: self
      ? CURRENT_USER_ID
      : customerId === `${DEMO_STAFF.id}-customer`
        ? DEMO_STAFF.id
        : (personas.find((persona) => persona.id === customerId)?.id ?? null),
    labels: {
      badge: t('demo.badge'),
      date: t('demo.date'),
      setDate: t('demo.setDate'),
      reset: t('demo.reset'),
      active: t('demo.active', { date }),
      persona: t('demo.persona'),
      choosePersona: t('demo.choosePersona'),
      switchPersona: t('demo.switch'),
      error: t('demo.error'),
      rateLimited: t('demo.rateLimited'),
    },
  };
}
