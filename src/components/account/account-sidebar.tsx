'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type AccountSidebarProps = {
  locale: Locale;
  /** A signatory signs for a company, but cannot read its contracts or invoices. */
  applicationsOnly?: boolean;
};

export default function AccountSidebar({ locale, applicationsOnly = false }: AccountSidebarProps) {
  const pathname = usePathname();
  const t = getT(locale);

  const items = [
    {
      label: t('account.applications.title'),
      href: `/${locale}/account/applications`,
    },
    ...(applicationsOnly
      ? []
      : [
          { label: t('account.invoices.title'), href: `/${locale}/account/invoices` },
          { label: t('account.contracts.title'), href: `/${locale}/account/contracts` },
        ]),
  ];

  return (
    <aside className="w-64 shrink-0 border-r border-stone-800 bg-stone-900/40">
      <nav className="sticky top-0 flex flex-col gap-2 p-4">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== `/${locale}/account` && pathname.startsWith(`${item.href}/`));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 rounded-lg px-4 py-3 text-sm font-medium transition ${
                active
                  ? 'bg-emerald-950/60 text-emerald-300'
                  : 'text-stone-400 hover:bg-stone-800 hover:text-stone-100'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
