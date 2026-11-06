import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { AccountSettings } from '@/components/account-settings';
import { DashboardShell } from '@/components/dashboard-shell';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { readIdentity } from '@/server/auth-session';
import { db } from '@/server/db';

export default async function SettingsPage({ params }: PageProps<'/[locale]/account/settings'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const identity = await readIdentity(db, await headers());
  if (!identity) redirect(`/${locale}/login`);
  const t = getT(locale);
  return (
    <DashboardShell locale={locale} active="settings">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-tagline font-semibold">{t('dashboard.settings')}</h2>
        <p className="mt-4 text-body">{t('account.welcome', { name: identity.name })}</p>
        <p className="mt-3 text-caption text-ink-muted wrap-anywhere">{identity.email}</p>
        {!identity.emailVerified ? (
          <p className="mt-2 text-caption text-ink-muted">{t('account.unverified')}</p>
        ) : null}
        <AccountSettings locale={locale} name={identity.name} />
      </div>
    </DashboardShell>
  );
}
