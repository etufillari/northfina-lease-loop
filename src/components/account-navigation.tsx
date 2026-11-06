'use client';
import Link from 'next/link';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { useCart } from './cart-store';
import { LanguageSwitcher } from './language-switcher';
import { NavPopover } from './nav-popover';
import { UiIcon, type IconName } from './ui-icon';

export function AccountNavigation({
  locale,
  accountLabel,
  languageLabel,
  staff = false,
}: {
  locale: Locale;
  accountLabel: string;
  languageLabel: string;
  staff?: boolean;
}) {
  const t = getT(locale);
  const cart = useCart();
  const links: {
    section: string;
    label: 'overview' | 'leases' | 'payments' | 'settings';
    icon: IconName;
  }[] = [
    { section: '', label: 'overview', icon: 'account' },
    { section: '/leases', label: 'leases', icon: 'leases' },
    { section: '/payments', label: 'payments', icon: 'payments' },
    { section: '/settings', label: 'settings', icon: 'settings' },
  ];
  return (
    <nav aria-label={t('nav.utilities')} className="relative flex items-center gap-1">
      <Link
        href={`/${locale}/cart`}
        aria-label={t('cart.navCount', { count: cart.length })}
        title={t('cart.nav')}
        className="pressable relative flex min-h-target min-w-target items-center justify-center rounded-pill text-ink hover:bg-parchment hover:ring-1 hover:ring-hairline focus-visible:bg-parchment"
      >
        <UiIcon name="cart" className="size-5" />
        {cart.length ? (
          <span
            className="absolute -top-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white"
            aria-hidden="true"
          >
            {cart.length}
          </span>
        ) : null}
      </Link>
      <NavPopover label={accountLabel} trigger={<UiIcon name="account" className="size-5" />}>
        <p className="px-3 py-2 text-caption font-semibold">{accountLabel}</p>
        {links.map((link) => (
          <Link
            key={link.label}
            href={`/${locale}/account${link.section}`}
            className="flex min-h-target items-center gap-3 rounded-sm px-3 text-caption hover:bg-parchment focus-visible:bg-parchment"
          >
            <UiIcon name={link.icon} className="size-5 text-ink-muted" />
            {t(`dashboard.${link.label}`)}
          </Link>
        ))}
        {staff ? (
          <Link
            href={`/${locale}/staff`}
            className="mt-2 flex min-h-target items-center gap-3 rounded-sm border-t border-hairline px-3 text-caption text-primary hover:bg-parchment"
          >
            <UiIcon name="leases" className="size-5" />
            {t('recovery.staff')}
          </Link>
        ) : null}
      </NavPopover>
      <LanguageSwitcher current={locale} label={languageLabel} />
    </nav>
  );
}
