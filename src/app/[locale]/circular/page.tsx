import { assetConditionSchema } from '@/data/schemas';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { isLocale, intlLocale } from '@/i18n/locales';
import { getT } from '@/i18n/get-t';
import { formatEuro } from '@/domain/money';
import { anniversary } from '@/domain/lease-engine/calendar';
import { circularDashboard } from '@/server/circular/queries';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';
import { CircularActions } from '@/components/circular-actions';
export default async function CircularPage({
  params,
  searchParams,
}: PageProps<'/[locale]/circular'>) {
  const { locale } = await params;
  if (!isLocale(locale) || process.env.NODE_ENV !== 'development') notFound();
  await connection();
  const t = getT(locale);
  const query = await searchParams;
  const examples = query.examples === '1';
  const rows = (await circularDashboard(db)).filter((row) =>
    query.asset ? row.asset.id === query.asset : examples || row.history.length > 0
  );
  const today = todayIso();
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <Link href={`/${locale}/account`} className="underline">
        {t('account.title')}
      </Link>
      <h1 className="text-3xl font-semibold">{t('circular.title')}</h1>
      <p>{t('circular.demo')}</p>
      <p>{t('circular.steps')}</p>
      <Link className="underline" href={`/${locale}/circular${examples ? '' : '?examples=1'}`}>
        {t(examples ? 'circular.hideExamples' : 'circular.showExamples')}
      </Link>
      {rows.length === 0 && <p>{t('circular.empty')}</p>}
      {rows.map((row) => {
        const lastLease = row.history.find((l) => l.id === row.completedLeaseId);
        const end = lastLease?.terminatedOn
          ? { ok: true as const, value: lastLease.terminatedOn }
          : lastLease
            ? anniversary(lastLease.startDate, lastLease.termMonths)
            : null;
        const date = end?.ok && end.value > today ? end.value : today;
        return (
          <section
            key={row.asset.id}
            className="rounded-xl border border-stone-300 p-5 dark:border-stone-700"
          >
            <h2 className="text-xl font-semibold">
              {row.asset.make} {row.asset.model} — {row.asset.id}
            </h2>
            <p>
              {t('circular.identity')}: {row.asset.serial_number} · {t('circular.lives')}:{' '}
              {row.asset.previous_lives} · {t(`status.${row.asset.status}`)}
            </p>
            <p>
              {t('circular.impact')}: {(row.impactGrams / 1000).toLocaleString(intlLocale[locale])}{' '}
              kg CO₂e
            </p>
            {row.asset.previous_lives >
              row.history.filter((l) => ['COMPLETED', 'TERMINATED'].includes(l.status)).length && (
              <p className="text-sm">{t('circular.imported')}</p>
            )}
            {row.history.map((lease) => (
              <p key={lease.id} className="text-sm">
                {lease.contractId} → {lease.id} · {lease.startDate} · {lease.status}
              </p>
            ))}
            <details className="mt-3 text-sm">
              <summary>{t('circular.audit')}</summary>
              <ul>
                {row.audit.map((event) => (
                  <li key={event.id}>
                    {event.created_at.toISOString()} · {event.actor} · {event.action}
                  </li>
                ))}
              </ul>
            </details>
            {row.receipt?.costCents !== null && row.receipt?.costCents !== undefined && (
              <p>
                {t('circular.cost')}: {formatEuro(row.receipt.costCents, intlLocale[locale])}
              </p>
            )}
            {row.receipt?.status === 'REVIEW_REQUIRED' && (
              <p role="status">
                {t('circular.review')}{' '}
                {formatEuro(row.receipt.offerNetCents ?? 0, intlLocale[locale])}
              </p>
            )}
            {row.offer && (
              <p>
                {t('circular.price')}: {formatEuro(row.offer.netListCents, intlLocale[locale])} ·{' '}
                {row.offer.publishedOn}
              </p>
            )}
            {row.matches.length > 0 && (
              <div className="mt-3">
                <p>{t('circular.matches')}</p>
                {row.matches.map((match) => (
                  <p key={match.requestId}>
                    {match.requestId}: {formatEuro(match.monthlyNetCents, intlLocale[locale])} /{' '}
                    {match.termMonths} · {match.neededBy}
                  </p>
                ))}
              </div>
            )}
            {row.asset.status === 'available' && row.offer && (
              <Link
                href={`/${locale}/assets/${row.asset.id}`}
                className="mt-3 inline-block font-semibold underline"
              >
                {t('circular.release')}
              </Link>
            )}
            {!row.activeLeaseId &&
              row.asset.status !== 'retired' &&
              !['READY', 'REVIEW_REQUIRED'].includes(row.receipt?.status ?? '') && (
                <CircularActions
                  moneyLocale={intlLocale[locale]}
                  grades={Object.fromEntries(
                    assetConditionSchema.options.map((grade) => [grade, t(`condition.${grade}`)])
                  )}
                  workNames={{
                    battery_replacement: t('work.battery'),
                    safety_inspection: t('work.safety'),
                    certified_data_wipe: t('work.wipe'),
                    major_service: t('work.service'),
                    'poor->fair': t('work.upgrade'),
                    'fair->good': t('work.upgrade'),
                    'good->like_new': t('work.upgrade'),
                  }}
                  assetId={row.asset.id}
                  leaseId={row.completedLeaseId}
                  receivedOn={date}
                  receipt={row.receipt}
                  condition={row.asset.condition}
                  usage={row.asset.usage.value}
                  labels={{
                    receive: t('circular.receive'),
                    inspect: t('circular.inspect'),
                    finish: t('circular.finish'),
                    condition: t('circular.condition'),
                    usage: t('circular.usage'),
                    confirm: t('circular.confirm'),
                    busy: t('engine.busy'),
                    error: t('engine.error'),
                    conflict: t('circular.conflict'),
                  }}
                />
              )}
          </section>
        );
      })}
    </main>
  );
}
