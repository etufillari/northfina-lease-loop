'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { localeNames, locales, type Locale } from '@/i18n/locales';
import { NavPopover } from './nav-popover';
import { UiIcon } from './ui-icon';

export function LanguageSwitcher({ current, label }: { current: Locale; label: string }) {
  const pathname = usePathname();
  const rest = pathname.split('/').slice(2).join('/');
  return (
    <NavPopover
      label={`${label}: ${localeNames[current]}`}
      trigger={
        <>
          <UiIcon name="globe" className="size-4" />
          <span className="text-caption uppercase">{current}</span>
          <UiIcon name="chevron" className="size-3" />
        </>
      }
    >
      <p className="px-3 py-2 text-caption font-semibold">{label}</p>
      {locales.map((locale) => (
        <Link
          key={locale}
          href={rest ? `/${locale}/${rest}` : `/${locale}`}
          hrefLang={locale}
          lang={locale}
          aria-current={locale === current ? 'page' : undefined}
          className={`flex min-h-target items-center justify-between rounded-sm px-3 text-caption hover:bg-parchment focus-visible:bg-parchment ${locale === current ? 'bg-parchment font-semibold' : ''}`}
        >
          <span>{localeNames[locale]}</span>
          <span className="text-fine uppercase text-ink-muted">{locale}</span>
        </Link>
      ))}
    </NavPopover>
  );
}
