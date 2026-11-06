// Who changed what, newest first. The role is checked here so nobody else sees the trail.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { AuditLogTable } from '@/components/admin/audit-log-table';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { can } from '@/domain/identity';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { listAuditLog } from '@/server/audit';
import { getActor } from '@/server/auth/actor';
import { db } from '@/server/db';

const NEWEST_ROWS = 100;

export default async function AuditLogPage({ params }: PageProps<'/[locale]/admin/audit-log'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Render on every request: every change adds a row.
  await connection();

  const t = getT(locale);
  const actor = await getActor();
  const allowed = actor !== null && can(actor.role, 'audit_log.view');
  const entries = allowed ? await listAuditLog(db, NEWEST_ROWS) : [];

  return (
    <main className="min-h-screen bg-stone-950 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <header>
          <h1 className="text-2xl font-semibold text-stone-100">{t('audit.title')}</h1>
          {allowed && <p className="mt-2 text-sm text-stone-400">{t('audit.description')}</p>}
        </header>

        {!allowed ? (
          <ErrorState
            title={t('audit.forbiddenTitle')}
            description={t('audit.forbiddenDescription')}
          />
        ) : entries.length === 0 ? (
          <EmptyState title={t('audit.emptyTitle')} description={t('audit.emptyDescription')} />
        ) : (
          <AuditLogTable entries={entries} locale={locale} t={t} />
        )}
      </div>
    </main>
  );
}
