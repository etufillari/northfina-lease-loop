// The staff desk: applications that need a person. Manual reviews (scenario card 7) get
// approve / decline; companies whose applicant cannot sign (card 6) get "sign as signatory".
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { STAFF_PERSONA } from '@/components/persona-cookie';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT, type MessageKey, type Translate } from '@/i18n/get-t';
import { intlLocale, isLocale, type Locale } from '@/i18n/locales';
import { asOfFromPage } from '@/server/as-of';
import { db } from '@/server/db';
import { listStaffQueue, type StaffQueueItem } from '@/server/staff';
import { isHoldExpired, listExpiredHolds } from '@/server/staff-holds';
import { ReleaseExpiredHolds, ReviewActions, SignAsSignatory } from './staff-actions';

type Reason = { rule: string; outcome: string };

export default async function StaffPage({ params, searchParams }: PageProps<'/[locale]/staff'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const { asOf, asOfParam } = await asOfFromPage(await searchParams);
  // Staff decisions are always logged as staff, never as the customer persona picked in the
  // header (the server also refuses a customer deciding on their own application).
  const actor = STAFF_PERSONA;
  const [queue, expired] = await Promise.all([listStaffQueue(db), listExpiredHolds(db, asOf)]);
  const reviews = queue.filter((item) => item.status === 'manual_review');
  // A signatory whose hold ran out can no longer sign: those wait under "Holds that ran out".
  const signatures = queue.filter(
    (item) => item.status === 'awaiting_signature' && !isHoldExpired(item.holdUntil, asOf)
  );
  const suffix = asOfParam ? `?asOf=${asOfParam}` : '';

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t('staff.title')}</h1>
          <p className="mt-2 text-stone-600 dark:text-stone-400">{t('staff.intro')}</p>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            {t('staff.actingAs', { actor })}
          </p>
        </div>
        <Link
          href={`/${locale}/staff/audit${suffix}`}
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          {t('staff.auditLink')}
        </Link>
      </div>

      <Section
        title={t('staff.review.title')}
        empty={t('staff.review.empty')}
        count={reviews.length}
      >
        {reviews.map((item) => (
          <QueueCard key={item.applicationId} item={item} locale={locale} t={t}>
            <ReviewActions locale={locale} applicationId={item.applicationId} actor={actor} />
          </QueueCard>
        ))}
      </Section>

      <Section
        title={t('staff.signature.title')}
        empty={t('staff.signature.empty')}
        count={signatures.length}
      >
        {signatures.map((item) => (
          <QueueCard key={item.applicationId} item={item} locale={locale} t={t}>
            {item.signatoryEmail ? (
              <SignAsSignatory
                locale={locale}
                applicationId={item.applicationId}
                signatoryEmail={item.signatoryEmail}
                defaultStartDate={asOf}
              />
            ) : (
              <p className="text-sm text-red-700 dark:text-red-400">{t('staff.noSignatory')}</p>
            )}
          </QueueCard>
        ))}
      </Section>

      {expired.length > 0 ? (
        <Section title={t('staff.expired.title')} empty="" count={expired.length}>
          {expired.map((item) => (
            <QueueCard
              key={item.applicationId}
              item={item}
              locale={locale}
              t={t}
              showReasons={false}
            >
              <p className="text-sm text-stone-700 dark:text-stone-300">
                {t(
                  item.status === 'awaiting_signature'
                    ? 'staff.expired.noSignatory'
                    : 'staff.expired.noSignature',
                  { date: formatIsoDate(item.holdUntil!, locale) }
                )}
              </p>
            </QueueCard>
          ))}
        </Section>
      ) : null}
      {expired.length > 0 ? (
        <ReleaseExpiredHolds locale={locale} actor={actor} count={expired.length} asOf={asOf} />
      ) : null}
    </div>
  );
}

function Section({
  title,
  empty,
  count,
  children,
}: {
  title: string;
  empty: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold">
        {title} <span className="text-stone-500">({count})</span>
      </h2>
      {count === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-stone-300 p-6 text-center text-stone-600 dark:border-stone-700 dark:text-stone-400">
          {empty}
        </p>
      ) : (
        <ul className="mt-4 space-y-4">{children}</ul>
      )}
    </section>
  );
}

function QueueCard({
  item,
  locale,
  t,
  children,
  showReasons = true,
}: {
  item: StaffQueueItem<string>;
  locale: Locale;
  t: Translate;
  children: React.ReactNode;
  /** Off for expired holds: why it was approved no longer matters there. */
  showReasons?: boolean;
}) {
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const reasons = Array.isArray(item.decisionReasons)
    ? (item.decisionReasons as Reason[]).filter((r) => r.outcome !== 'not_applicable')
    : [];
  const flagged = reasons.filter((r) => r.outcome === 'manual_review' || r.outcome === 'failed');

  return (
    <li className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold">{item.customerName ?? item.customerId}</p>
          <p className="text-stone-600 dark:text-stone-400">{assetSummary(item.assets, t)}</p>
        </div>
        {item.holdUntil ? (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-900 ring-1 ring-amber-200 ring-inset dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800">
            {t('staff.item.holdUntil', { date: formatIsoDate(item.holdUntil, locale) })}
          </span>
        ) : null}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Fact label={t('staff.item.financed')} value={euro(item.financedCents)} />
        <Fact
          label={t('staff.item.term')}
          value={t('staff.item.termMonths', { months: item.termMonths })}
        />
        <Fact label={t('staff.item.monthly')} value={euro(item.monthlyNetRentCents)} />
        {item.signatoryEmail ? (
          <Fact label={t('staff.item.signatory')} value={item.signatoryEmail} />
        ) : null}
      </dl>

      {showReasons && reasons.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">{t('staff.item.reasons')}</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {(flagged.length > 0 ? flagged : reasons).map((reason) => (
              <li key={reason.rule} className="flex items-start justify-between gap-4">
                <span>{t(`reason.${reason.rule}` as MessageKey)}</span>
                <span className="shrink-0 font-medium">
                  {t(`outcome.${reason.outcome}` as MessageKey)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 border-t border-stone-200 pt-4 dark:border-stone-800">{children}</div>
    </li>
  );
}

/** A fleet as "Nordvolt Cargo Duo × 2, Nordvolt Urban 1 × 1", grouped by model. */
function assetSummary(assets: StaffQueueItem<string>['assets'], t: Translate): string {
  const counts = new Map<string, number>();
  for (const asset of assets) {
    const name = asset.name ?? asset.id;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => t('staff.item.asset', { name, count })).join(', ');
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="font-medium break-words">{value}</dd>
    </div>
  );
}
