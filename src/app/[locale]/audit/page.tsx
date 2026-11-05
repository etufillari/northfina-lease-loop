// Who changed what, and when: the audit log, newest first.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { listAuditLog } from '@/server/audit';
import { db } from '@/server/db';

export default async function AuditPage({ params }: PageProps<'/[locale]/audit'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const rows = await listAuditLog(db, 100);
  const when = new Intl.DateTimeFormat(intlLocale[locale], {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Europe/Helsinki',
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="font-display text-3xl font-extrabold tracking-tight uppercase sm:text-4xl">
        {t('audit.title')}
      </h1>
      <p className="mt-2 text-muted">{t('audit.intro')}</p>
      {rows.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed border-line p-6 text-muted">
          {t('audit.empty')}
        </p>
      ) : (
        <div className="panel mt-8 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs tracking-wide text-muted uppercase">
              <tr className="border-b border-line">
                <th className="px-4 py-3 font-semibold">{t('audit.when')}</th>
                <th className="px-4 py-3 font-semibold">{t('audit.who')}</th>
                <th className="px-4 py-3 font-semibold">{t('audit.what')}</th>
                <th className="px-4 py-3 font-semibold">{t('audit.entity')}</th>
                <th className="px-4 py-3 font-semibold">{t('audit.details')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-line align-top last:border-b-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                    <time dateTime={row.created_at}>{when.format(new Date(row.created_at))}</time>
                  </td>
                  <td className="px-4 py-3">{row.actor}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-surface-2 px-2.5 py-1 font-mono text-xs font-semibold whitespace-nowrap text-accent-text">
                      {row.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                    {row.entity_type} {row.entity_id}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs break-all text-muted">
                    {row.details === null ? '' : JSON.stringify(row.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
