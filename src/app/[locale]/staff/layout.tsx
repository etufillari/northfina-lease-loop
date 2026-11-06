import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { StaffTabs } from '@/components/staff-tabs';
import { isLocale } from '@/i18n/locales';
import { readIdentity } from '@/server/auth-session';
import { db } from '@/server/db';

export default async function StaffLayout({ children, params }: LayoutProps<'/[locale]/staff'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const identity = await readIdentity(db, await headers());
  if (!identity) redirect(`/${locale}/login`);
  if (identity.role !== 'staff') notFound();
  return (
    <>
      <StaffTabs locale={locale} />
      {children}
    </>
  );
}
