// The audit log, made readable: who did what, when, to which record, with the details as
// labelled values instead of raw JSON. Filter by record type (?type=) or one record (?entity=).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getT, type MessageKey } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { asOfFromPage } from '@/server/as-of';
import { listAuditLog } from '@/server/audit';
import { db } from '@/server/db';
import { AuditRow } from './audit-row';

/** How many of the newest rows the page reads before filtering. */
const ROW_LIMIT = 500;
const ENTITY_TYPES = ['application', 'contract', 'asset', 'customer'] as const;

export default async function AuditPage({
  params,
  searchParams,
}: PageProps<'/[locale]/staff/audit'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const query = await searchParams;
  const { asOfParam } = await asOfFromPage(query);
  const type = typeof query.type === 'string' ? query.type : null;
  const entity = typeof query.entity === 'string' ? query.entity : null;

  const [rows, customers] = await Promise.all([
    listAuditLog(db, ROW_LIMIT),
    db.customer.findMany({ select: { id: true, name: true } }),
  ]);
  const names = Object.fromEntries(customers.map((c) => [c.id, c.name]));
  const shown = rows.filter(
    (row) => (!type || row.entity_type === type) && (!entity || row.entity_id === entity)
  );

  const href = (next: { type?: string | null; entity?: string | null }) => {
    const search = new URLSearchParams();
    if (asOfParam) search.set('asOf', asOfParam);
    if (next.type) search.set('type', next.type);
    if (next.entity) search.set('entity', next.entity);
    const qs = search.toString();
    return `/${locale}/staff/audit${qs ? `?${qs}` : ''}`;
  };

  const tab = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${
      active
        ? 'bg-emerald-700 text-white ring-emerald-700'
        : 'bg-white text-stone-800 ring-stone-300 hover:bg-stone-100 dark:bg-stone-900 dark:text-stone-200 dark:ring-stone-700 dark:hover:bg-stone-800'
    }`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link
        href={`/${locale}/staff${asOfParam ? `?asOf=${asOfParam}` : ''}`}
        className="text-sm text-emerald-800 hover:underline dark:text-emerald-300"
      >
        ← {t('staff.title')}
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{t('staff.audit.title')}</h1>
      <p className="mt-2 max-w-3xl text-stone-600 dark:text-stone-400">{t('staff.audit.intro')}</p>

      <nav aria-label={t('staff.audit.filter')} className="mt-6 flex flex-wrap gap-2">
        <Link href={href({})} className={tab(!type && !entity)}>
          {t('staff.audit.all')}
        </Link>
        {ENTITY_TYPES.map((value) => (
          <Link key={value} href={href({ type: value })} className={tab(type === value)}>
            {t(`staff.audit.type.${value}` as MessageKey)}
          </Link>
        ))}
      </nav>

      {entity ? (
        <p className="mt-4 text-sm">
          {t('staff.audit.onlyEntity', { id: entity })}{' '}
          <Link
            href={href({ type })}
            className="font-medium text-emerald-800 underline dark:text-emerald-300"
          >
            {t('staff.audit.clear')}
          </Link>
        </p>
      ) : null}

      <p className="mt-4 text-sm text-stone-600 dark:text-stone-400" aria-live="polite">
        {t('staff.audit.count', { shown: shown.length, limit: ROW_LIMIT })}
      </p>

      {shown.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-stone-300 p-6 text-center text-stone-600 dark:border-stone-700 dark:text-stone-400">
          {t('staff.audit.empty')}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('staff.audit.title')}</caption>
            <thead className="border-b border-stone-200 bg-stone-50 text-stone-600 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-400">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('staff.audit.col.when')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('staff.audit.col.who')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('staff.audit.col.what')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('staff.audit.col.record')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('staff.audit.col.details')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
              {shown.map((row) => (
                <AuditRow
                  key={row.id}
                  row={row}
                  locale={locale}
                  actorName={names[row.actor] ?? null}
                  asOfParam={asOfParam}
                  filterHref={href({ entity: row.entity_id })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
