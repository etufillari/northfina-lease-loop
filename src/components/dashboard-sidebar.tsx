import Link from 'next/link';
import { DevUserSwitcher } from '@/components/dev-user-switcher';
import type { ActiveUserOption, CustomerType } from '@/active-user';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

export function DashboardSidebar({
  locale,
  activeUserData,
}: {
  locale: Locale;
  activeUserData: [ActiveUserOption[], ActiveUserOption | null] | null;
}) {
  const t = getT(locale);
  const links = [
    { href: `/${locale}`, label: t('nav.catalogue'), icon: '▦' },
    { href: `/${locale}/leases`, label: t('nav.leases'), icon: '▣' },
    { href: `/${locale}/saved`, label: t('nav.saved'), icon: '♡' },
    { href: `/${locale}`, label: t('nav.transactions'), icon: '⇄' },
    { href: `/${locale}/account`, label: t('nav.account'), icon: '♙' },
    ...(process.env.NODE_ENV === 'development'
      ? [{ href: `/${locale}/circular`, label: t('circular.title'), icon: '↻' }]
      : []),
  ];

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto bg-[#101d46] px-4 py-6 text-white lg:flex">
      <Link href={`/${locale}`} className="flex items-center gap-3 px-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-500 text-xl font-bold">
          ↻
        </span>
        <span className="text-lg font-semibold tracking-tight">{t('brand.name')}</span>
      </Link>
      <nav className="mt-10" aria-label={t('nav.dashboard')}>
        <ul className="space-y-2">
          {links.map((link, index) => (
            <li key={`${link.label}-${index}`}>
              <Link
                href={link.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  index === 0
                    ? 'bg-white/20 text-white'
                    : 'text-blue-100 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span aria-hidden="true" className="w-5 text-center text-lg">
                  {link.icon}
                </span>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div
        className={`mt-auto border-t border-white/15 pt-5 ${
          activeUserData ? 'flex flex-col gap-3' : ''
        }`}
      >
        {activeUserData ? (
          <DevUserSwitcher
            users={activeUserData[0]}
            activeUserId={activeUserData[1]?.id ?? null}
            buttonLabel={t('dev.mode')}
            label={t('dev.activeUser')}
            resetLabel={t('dev.noActiveUser')}
            customerTypeLabels={
              {
                consumer: t('customerType.consumer'),
                sole_trader: t('customerType.sole_trader'),
                company: t('customerType.company'),
              } satisfies Record<CustomerType, string>
            }
          />
        ) : null}
        <div className="flex min-w-0 items-center gap-2 rounded-xl bg-white/10 p-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-blue-200 text-sm font-bold text-[#101d46]">
            LL
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {activeUserData?.[1]?.name ?? t('brand.name')}
            </p>
            <p className="text-xs text-blue-200">{activeUserData?.[1]?.type ?? t('nav.devUser')}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
