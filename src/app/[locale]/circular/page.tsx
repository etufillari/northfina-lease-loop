import { cookies } from 'next/headers';
import { OPERATOR_COOKIE, validOperatorSession } from '@/server/circular/operator-session';
import { OperatorAccess } from '@/components/operator-access';
import { LeaseEnginePanel } from '@/components/lease-engine-panel';
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
import { companyModeActive } from '@/server/company-mode';
import { latestLifecycleDate } from '@/domain/circular/workflow-date';
export default async function CircularPage({
  params,
  searchParams,
}: PageProps<'/[locale]/circular'>) {
  const { locale } = await params;
  if (!isLocale(locale) || process.env.NODE_ENV !== 'development' || !(await companyModeActive()))
    notFound();
  await connection();
  const t = getT(locale);
  const signedIn = validOperatorSession((await cookies()).get(OPERATOR_COOKIE)?.value);
  const access = (
    <OperatorAccess
      signedIn={signedIn}
      labels={{
        password: t('operator.password'),
        login: t('operator.login'),
        logout: t('operator.logout'),
        error: t('operator.loginError'),
      }}
    />
  );
  if (!signedIn)
    return (
      <div className="ui-surface mx-auto my-10 max-w-xl space-y-6 p-6 sm:p-8">
        <h1>{t('circular.title')}</h1>
        <p>{t('operator.access')}</p>
        {access}
      </div>
    );
  const query = await searchParams;
  const examples = query.examples === '1';
  const returnedQueue = query.view === 'returned';
  const requestQueue = query.view === 'requests';
  const rows = (await circularDashboard(db)).filter((row) =>
    requestQueue
      ? row.receipt?.status === 'REQUESTED'
      : returnedQueue
        ? Boolean(row.receipt && row.asset.status === 'returned')
        : query.asset
          ? row.asset.id === query.asset
          : examples || row.history.length > 0
  );
  const today = todayIso();
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">
        {t(returnedQueue ? 'nav.returned' : 'circular.title')}
      </h1>
      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {t('circular.demo')}
      </p>
      {access}
      <Link href={`/${locale}/circular?view=all`} className="inline-block min-h-11 py-2 underline">
        {t('circular.allOperations')}
      </Link>
      <p className="rounded-xl bg-slate-100 p-4 text-sm leading-relaxed text-slate-700 dark:bg-slate-800 dark:text-slate-200">
        {t('circular.steps')}
      </p>
      {returnedQueue ? (
        <Link className="underline" href={`/${locale}/circular?view=all`}>
          {t('circular.allOperations')}
        </Link>
      ) : (
        <Link className="underline" href={`/${locale}/circular${examples ? '' : '?examples=1'}`}>
          {t(examples ? 'circular.hideExamples' : 'circular.showExamples')}
        </Link>
      )}
      {rows.length === 0 && <p>{t(returnedQueue ? 'circular.emptyReturned' : 'circular.empty')}</p>}
      {rows.map((row) => {
        const lastLease = row.history.find((l) => l.id === row.completedLeaseId);
        const end = lastLease?.terminatedOn
          ? { ok: true as const, value: lastLease.terminatedOn }
          : lastLease
            ? anniversary(lastLease.startDate, lastLease.termMonths)
            : null;
        const date = latestLifecycleDate(
          today,
          end?.ok ? end.value : null,
          row.receipt?.receivedOn,
          row.receipt?.completedOn
        );
        return (
          <section key={row.asset.id} className="ui-surface space-y-3 p-5 sm:p-7">
            <h2 className="text-xl font-semibold">
              {row.asset.make} {row.asset.model} — {row.asset.id}
            </h2>
            <p>
              {t('circular.identity')}: {row.asset.serial_number} · {t('circular.lives')}:{' '}
              {row.asset.previous_lives} · {t(`status.${row.asset.status}`)}
            </p>
            {row.receipt?.requestedOn && (
              <p>
                {t('circular.requestedOn')}: {row.receipt.requestedOn} · {t('asset.usage')}:{' '}
                {row.receipt.usageValue !== null
                  ? t(`usage.${row.asset.usage.unit}`, { value: row.receipt.usageValue })
                  : t(`usage.${row.asset.usage.unit}`, { value: row.asset.usage.value })}
              </p>
            )}
            <p>
              {t('circular.impact')}: {(row.impactGrams / 1000).toLocaleString(intlLocale[locale])}{' '}
              kg CO₂e
            </p>
            {row.asset.previous_lives >
              row.history.filter((l) => ['COMPLETED', 'TERMINATED'].includes(l.status)).length && (
              <p className="text-sm">{t('circular.imported')}</p>
            )}
            {row.history.map((lease) => (
              <details key={lease.id} open={row.asset.id === query.asset}>
                <summary className="cursor-pointer rounded-lg border border-slate-200 px-3 py-3 text-sm break-words hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                  {lease.contractId} · {lease.status}
                </summary>
                <LeaseEnginePanel
                  contractId={lease.contractId}
                  leaseId={lease.id}
                  status={lease.status}
                  locale={locale}
                  operator
                />
              </details>
            ))}
            <details className="mt-3 text-sm text-slate-600 dark:text-slate-300">
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
              <p
                role="status"
                className="rounded-xl bg-slate-100 p-4 text-sm font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-100"
              >
                {t('circular.review')}{' '}
                {formatEuro(row.receipt.offerNetCents ?? 0, intlLocale[locale])}
              </p>
            )}
            {row.receipt?.status === 'PENDING_APPROVAL' && (
              <p
                role="status"
                className="rounded-xl bg-slate-100 p-4 text-sm font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-100"
              >
                {t('circular.pendingApproval')}{' '}
                {formatEuro(row.receipt.offerNetCents ?? 0, intlLocale[locale])}
              </p>
            )}
            {row.receipt?.status === 'REJECTED' && (
              <p
                role="status"
                className="rounded-xl bg-slate-100 p-4 text-sm font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-100"
              >
                {t('circular.rejected')} {row.receipt.reviewReason}
              </p>
            )}
            {row.receipt?.reviewedBy && (
              <p>
                {row.receipt.reviewedBy} · {row.receipt.reviewedOn}
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
              !['READY', 'REVIEW_REQUIRED', 'REJECTED'].includes(row.receipt?.status ?? '') && (
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
                  usageUnit={t(`usage.unit.${row.asset.usage.unit}`)}
                  currentDate={date}
                  labels={{
                    receive: t('circular.receive'),
                    confirmReceipt: t('circular.confirmReceipt'),
                    inspect: t('circular.inspect'),
                    finish: t('circular.finish'),
                    approve: t('circular.approve'),
                    reject: t('circular.reject'),
                    rejectReason: t('circular.rejectReason'),
                    pendingApproval: t('circular.pendingApproval'),
                    rejected: t('circular.rejected'),
                    condition: t('circular.condition'),
                    usage: t('circular.usage'),
                    confirm: t('circular.confirm'),
                    busy: t('engine.busy'),
                    error: t('engine.error'),
                    conflict: t('circular.conflict'),
                    dateError: t('circular.dateError'),
                  }}
                />
              )}
          </section>
        );
      })}
    </div>
  );
}
