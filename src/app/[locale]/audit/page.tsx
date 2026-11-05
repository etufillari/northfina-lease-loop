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
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('audit.title')}</h1>
      <p className="mt-2 text-stone-700 dark:text-stone-300">{t('audit.intro')}</p>
      {rows.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-stone-300 p-6 dark:border-stone-700">
          {t('audit.empty')}
        </p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-stone-600 dark:text-stone-400">
              <tr className="border-b border-stone-200 dark:border-stone-800">
                <th className="py-2 pr-4 font-medium">{t('audit.when')}</th>
                <th className="py-2 pr-4 font-medium">{t('audit.who')}</th>
                <th className="py-2 pr-4 font-medium">{t('audit.what')}</th>
                <th className="py-2 pr-4 font-medium">{t('audit.entity')}</th>
                <th className="py-2 font-medium">{t('audit.details')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-stone-100 align-top dark:border-stone-800"
                >
                  <td className="py-2 pr-4 whitespace-nowrap">
                    <time dateTime={row.created_at}>{when.format(new Date(row.created_at))}</time>
                  </td>
                  <td className="py-2 pr-4">{row.actor}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{row.action}</td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {row.entity_type} {row.entity_id}
                  </td>
                  <td className="py-2 font-mono text-xs break-all">
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
