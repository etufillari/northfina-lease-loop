// The audit page: the hash chain's state, then the newest 50 audit rows, newest first, as a table
// whose rows open their details in a dock at the bottom of the screen (audit-table.tsx).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AuditChainBadge } from '@/components/audit-chain-badge';
import { Card, Notice, PageHeader, StaffNote } from '@/components/ui';
import { AuditTable, type AuditTableRow } from './audit-table';
import { formatTimestamp } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { auditDetailLines } from '@/domain/audit';
import { listAuditLog, verifyAuditChain } from '@/server/audit';
import { db } from '@/server/db';

const LIMIT = 50;

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/audit'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: t('meta.pageTitle', { page: t('audit.title') }) };
}

export default async function AuditPage({ params }: PageProps<'/[locale]/audit'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const [rows, verdict] = await Promise.all([listAuditLog(db, LIMIT), verifyAuditChain(db)]);
  const tableRows: AuditTableRow[] = rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    when: formatTimestamp(row.created_at, locale),
    actor: row.actor,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    lines: auditDetailLines(row.details),
  }));
  // `{id}` and `{count}` stay in the text; the table fills them per entry.
  const labels = {
    caption: t('audit.caption', { count: LIMIT }),
    when: t('audit.col.when'),
    who: t('audit.col.actor'),
    action: t('audit.col.action'),
    target: t('audit.col.entity'),
    details: t('audit.col.details'),
    none: t('audit.noDetails'),
    view: t('audit.details.view'),
    hide: t('audit.details.hide'),
    entry: t('audit.details.entry', { id: '{id}' }),
    close: t('audit.details.close', { id: '{id}' }),
    closeAll: t('audit.details.closeAll'),
    dock: t('audit.details.dock', { count: '{count}' }),
    fields: t('audit.details.fields'),
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader title={t('audit.title')} intro={t('audit.intro')}>
        <StaffNote>{t('staff.note')}</StaffNote>
      </PageHeader>
      <AuditChainBadge verdict={verdict} t={t} />

      {rows.length === 0 ? (
        <Notice tone="info">{t('audit.empty')}</Notice>
      ) : (
        <Card padded={false}>
          {/* The table scrolls sideways on a phone instead of squeezing the columns. */}
          <AuditTable rows={tableRows} labels={labels} />
        </Card>
      )}
    </div>
  );
}
