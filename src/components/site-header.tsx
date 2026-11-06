// The top of every page, in two layers:
// - the staff strip (teal): the demo tools a customer would never see in a real product,
//   i.e. who you are acting as and the demo page (the audit log is linked from there);
// - the customer header (paper): the brand, the catalogue, how it works and the language.
// A server component; the actor picker, the nav and the language switcher are small clients.
import Link from 'next/link';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { ADMIN_ACTOR, ANONYMOUS_ACTOR } from '@/server/actor';
import { ActorPicker } from './actor-picker';
import { LanguageSwitcher } from './language-switcher';
import { LoopMark } from './loop-mark';
import { NavLinks, cx } from './ui';

type SiteHeaderProps = {
  locale: Locale;
  t: Translate;
  actor: string;
  customers: readonly { id: string; name: string }[];
};

export function SiteHeader({ locale, t, actor, customers }: SiteHeaderProps) {
  const isAdmin = actor === ADMIN_ACTOR;
  const staffLinks = [
    // The audit log is reached from the demo page's "Audit log" section, not from here.
    { href: `/${locale}/demo`, label: t('nav.demo') },
  ];
  const mainLinks = [
    { href: `/${locale}/catalogue`, label: t('nav.catalogue') },
    { href: `/${locale}#how-it-works`, label: t('nav.howItWorks') },
    // Once someone is chosen in "Continue as": their leases (every lease for admin).
    ...(actor === ANONYMOUS_ACTOR
      ? []
      : [{ href: `/${locale}/leases`, label: t(isAdmin ? 'nav.leasesAdmin' : 'nav.leases') }]),
  ];

  return (
    <>
      <div className="staff-zone bg-staff text-staff-contrast">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-bold tracking-wide uppercase opacity-80 max-sm:hidden">
              {t('staff.label')}
            </span>
            <nav aria-label={t('staff.nav')}>
              <ul className="flex flex-wrap gap-1">
                {staffLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="block rounded-full px-3 py-1 font-semibold underline-offset-4 hover:bg-staff-hover hover:underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <ActorPicker
            onDark
            customers={customers}
            current={actor}
            labels={{
              label: t('actor.label'),
              anonymous: t('actor.anonymous'),
              admin: t('actor.admin'),
              submit: t('actor.submit'),
              clear: t('actor.clear'),
              error: t('actor.error'),
            }}
          />
        </div>
      </div>

      <header className="rule-dashed border-b-2 bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href={`/${locale}`}
            className="flex items-center gap-2.5 rounded-lg"
            aria-label={t('brand.home')}
          >
            <LoopMark className="size-9" />
            <span className="font-heading text-xl font-semibold tracking-tight">
              {t('brand.name')}
            </span>
          </Link>

          <div className="hidden items-center gap-4 md:flex">
            <NavLinks label={t('nav.main')} items={mainLinks} />
            <LanguageSwitcher current={locale} label={t('nav.language')} />
          </div>

          {/* On a phone the links fold into a menu; <details> needs no JavaScript. */}
          <details data-nav-menu className="group relative md:hidden">
            <summary
              className={cx(
                'flex size-11 cursor-pointer list-none items-center justify-center rounded-full',
                'border-2 border-brand text-brand-text'
              )}
            >
              <span className="sr-only">{t('nav.menu')}</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path className="group-open:hidden" d="M4 7h16M4 12h16M4 17h16" />
                <path className="hidden group-open:block" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-64 space-y-4 rounded-lg border border-line bg-raised p-4 shadow-lg">
              <NavLinks label={t('nav.main')} items={mainLinks} vertical />
              <LanguageSwitcher current={locale} label={t('nav.language')} />
            </div>
          </details>
        </div>
      </header>
    </>
  );
}
