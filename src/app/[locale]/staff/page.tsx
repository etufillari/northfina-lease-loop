import { connection } from 'next/server';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { CompanyDashboard } from '@/components/company-dashboard';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { readIdentity } from '@/server/auth-session';
import { loadCompanyMetrics, staffAttentionCounts } from '@/server/company-metrics';
import { db } from '@/server/db';
import { appToday } from '@/server/demo-mode';

export default async function Page({ params }: PageProps<'/[locale]/staff'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const identity = await readIdentity(db, await headers());
  if (!identity) redirect(`/${locale}/login`);
  if (identity.role !== 'staff') notFound();
  const today = await appToday();
  const [metrics, attention, simulated] = await Promise.all([
    loadCompanyMetrics(db, today),
    staffAttentionCounts(db),
    db.contract.count({ where: { isDemo: true } }),
  ]);
  const t = getT(locale);
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <h1 className="font-display text-display-sm font-semibold">{t('admin.title')}</h1>
      <p className="mt-3 max-w-2xl text-body text-ink-muted">{t('admin.intro')}</p>
      {simulated > 0 ? (
        <p className="mt-3 max-w-2xl text-caption text-ink-muted">{t('admin.simulatedNote')}</p>
      ) : null}
      <CompanyDashboard locale={locale} metrics={metrics} attention={attention} />
    </div>
  );
}
