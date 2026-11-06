'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

export function StaffTabs({ locale }: { locale: Locale }) {
  const t = getT(locale);
  const pathname = usePathname();
  const base = `/${locale}/staff`;
  const tabs = [
    { href: base, label: t('admin.overview'), active: pathname === base },
    {
      href: `${base}/returns`,
      label: t('admin.requests'),
      active: pathname.startsWith(`${base}/returns`),
    },
    {
      href: `${base}/applications`,
      label: t('review.tab'),
      active: pathname.startsWith(`${base}/applications`),
    },
    {
      href: `${base}/audit`,
      label: t('audit.tab'),
      active: pathname.startsWith(`${base}/audit`),
    },
  ];
  return (
    <nav aria-label={t('recovery.staff')} className="border-b border-hairline bg-parchment">
      <div className="mx-auto flex max-w-[1200px] items-center gap-2 overflow-x-auto px-4 py-2 sm:px-6">
        <span className="mr-3 shrink-0 text-caption font-semibold">{t('recovery.staff')}</span>
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? 'page' : undefined}
            className={`flex min-h-target shrink-0 items-center rounded-pill px-4 text-caption ${tab.active ? 'bg-canvas font-semibold text-ink' : 'text-ink-muted hover:bg-canvas'}`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
