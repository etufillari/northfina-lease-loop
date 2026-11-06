import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { listAuditLog } from '@/server/audit';
import { db } from '@/server/db';

const LIMIT = 100;

/**
 * RULES §7: the audit trail, shown in the app. Every change to business data writes one row in
 * the same transaction as the change. Staff only (the staff layout checks the role).
 */
export default async function Page({ params }: PageProps<'/[locale]/staff/audit'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const entries = await listAuditLog(db, LIMIT);
  const users = await db.user.findMany({
    where: { id: { in: [...new Set(entries.map((entry) => entry.actor))] } },
    select: { id: true, name: true },
  });
  const names = new Map(users.map((user) => [user.id, user.name]));
  const t = getT(locale);
  const when = new Intl.DateTimeFormat(intlLocale[locale], {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Europe/Helsinki',
  });
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <h1 className="font-display text-display-sm font-semibold">{t('audit.title')}</h1>
      <p className="mt-3 max-w-2xl text-body text-ink-muted">
        {t('audit.intro', { count: LIMIT })}
      </p>
      {entries.length ? (
        <ol className="mt-6 divide-y divide-divider rounded-lg border border-hairline">
          {entries.map((entry) => (
            <li key={entry.id} className="grid gap-1 p-4 text-caption sm:grid-cols-[13rem_1fr]">
              <time dateTime={entry.created_at} className="text-ink-muted tabular-nums">
                {when.format(new Date(entry.created_at))}
              </time>
              <div className="min-w-0">
                <p>
                  <span className="font-semibold">
                    {names.get(entry.actor) ??
                      (entry.actor.startsWith('system:') || entry.actor === 'anonymous'
                        ? t('audit.system', { name: entry.actor })
                        : entry.actor)}
                  </span>{' '}
                  · <code className="text-primary">{entry.action}</code>
                </p>
                <p className="mt-1 text-ink-muted wrap-anywhere">
                  {entry.entity_type} · {entry.entity_id}
                </p>
                {entry.details !== null ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-primary">{t('audit.details')}</summary>
                    <pre className="mt-2 overflow-x-auto rounded-sm bg-parchment p-3 text-fine">
                      {JSON.stringify(entry.details, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-6 text-caption">{t('audit.empty')}</p>
      )}
    </div>
  );
}
