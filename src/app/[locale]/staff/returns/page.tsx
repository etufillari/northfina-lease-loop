import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getT, type MessageKey } from '@/i18n/get-t';
import { formatIsoDate } from '@/i18n/format';
import { isLocale } from '@/i18n/locales';
import { readIdentity } from '@/server/auth-session';
import { db } from '@/server/db';
import { listReturnCases } from '@/server/recovery';

/** Grouped by the next thing staff can do, most actionable first. */
const groups = [
  { id: 'relist', statuses: ['ready', 'received'] },
  { id: 'assess', statuses: ['pending'] },
  { id: 'progress', statuses: ['accepted'] },
  { id: 'waiting', statuses: ['quoted'] },
  { id: 'closed', statuses: ['published', 'retired', 'bought'] },
] as const;

export default async function Page({ params }: PageProps<'/[locale]/staff/returns'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const identity = await readIdentity(db, await headers());
  if (!identity) redirect(`/${locale}/login`);
  if (identity.role !== 'staff') notFound();
  // A cancelled request needs nothing from staff, whatever state its assessment was left in.
  const cases = (await listReturnCases(db)).filter((request) => request.status !== 'cancelled');
  const t = getT(locale);
  const stateOf = (request: (typeof cases)[number]) => request.assessment?.status ?? 'pending';
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <h1 className="font-display text-display-sm font-semibold">{t('recovery.queue')}</h1>
      <p className="mt-3 max-w-2xl text-body text-ink-muted">{t('recovery.queueIntro')}</p>
      {!cases.length ? (
        <p className="mt-10 rounded-lg bg-parchment p-6">{t('recovery.empty')}</p>
      ) : (
        groups.map((group) => {
          const members = cases.filter((request) =>
            (group.statuses as readonly string[]).includes(stateOf(request))
          );
          if (!members.length) return null;
          return (
            <section key={group.id} id={group.id} className="mt-10 scroll-mt-40">
              <h2 className="text-tagline font-semibold">
                {t(`recovery.group.${group.id}` as MessageKey)}{' '}
                <span className="text-caption font-normal text-ink-muted">({members.length})</span>
              </h2>
              <ul className="mt-3 space-y-3">
                {members.map((request) => (
                  <li key={request.id}>
                    <Link
                      href={`/${locale}/staff/returns/${request.id}`}
                      className="flex min-h-target flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline p-4 hover:border-primary hover:bg-parchment focus-visible:bg-parchment"
                    >
                      <div>
                        <p className="font-semibold">
                          {request.contract.asset.make} {request.contract.asset.model}
                        </p>
                        <p className="mt-1 text-caption text-ink-muted">
                          {request.contract.customer.owner.name} ·{' '}
                          {t(`recovery.kind.${request.kind}` as MessageKey)} ·{' '}
                          {formatIsoDate(request.createdAt.toISOString().slice(0, 10), locale)}
                        </p>
                      </div>
                      {group.statuses.length > 1 ? (
                        <span className="rounded-pill bg-parchment px-3 py-1 text-caption">
                          {t(`recovery.state.${stateOf(request)}` as MessageKey)}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
