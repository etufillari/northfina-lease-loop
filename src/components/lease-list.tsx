import Link from 'next/link';
import { contractNumberFor, statusClasses } from '@/components/contract-status';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { CustomerLease } from '@/server/contracts/customer-leases';

type LeaseListProps = { leases: CustomerLease[]; locale: Locale; t: Translate };

export function LeaseList({ leases, locale, t }: LeaseListProps) {
  if (leases.length === 0) {
    return (
      <p className="mt-8 rounded-xl border border-dashed border-ink-300 p-6 text-ink-700 dark:border-ink-700 dark:text-ink-300">
        {t('leases.empty')}
      </p>
    );
  }

  return (
    <ul className="mt-8 grid gap-4 lg:grid-cols-2">
      {leases.map((lease) => (
        <li key={lease.id}>
          <LeaseCard lease={lease} locale={locale} t={t} />
        </li>
      ))}
    </ul>
  );
}

function LeaseCard({ lease, locale, t }: { lease: CustomerLease; locale: Locale; t: Translate }) {
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const ready = lease.endOfTerm.status === 'ready';
  const headingId = `lease-${lease.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className={`group relative flex h-full flex-col rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md motion-reduce:transform-none sm:p-6 dark:bg-ink-900 dark:hover:border-brand-700 ${
        ready ? 'border-brand-500' : 'border-ink-200 dark:border-ink-800'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-ink-600 dark:text-ink-400">{lease.asset.make}</p>
          <h2 id={headingId} className="text-xl leading-snug font-semibold">
            {lease.asset.model}
          </h2>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusClasses[lease.status]}`}
        >
          {t(`contract.status.${lease.status}`)}
        </span>
      </div>

      <dl className="mt-4 mb-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-ink-600 dark:text-ink-400">{t('contract.endsOn')}</dt>
          <dd className="font-medium">{formatIsoDate(lease.endsOn, locale)}</dd>
        </div>
        <div>
          <dt className="text-ink-600 dark:text-ink-400">{t('lease.monthlyNet')}</dt>
          <dd className="font-medium">{euro(lease.monthlyNetRentCents)}</dd>
        </div>
      </dl>

      <p className="mt-auto text-sm leading-6">{noteFor(lease, locale, t, euro)}</p>

      {/* The ::after overlay makes the whole card clickable, with one short link. */}
      <Link
        href={`/${locale}/contracts/${lease.id}${ready ? '#end-of-term' : ''}`}
        aria-describedby={headingId}
        className="mt-4 font-medium text-brand-800 underline-offset-4 group-hover:underline after:absolute after:inset-0 after:rounded-2xl dark:text-brand-300"
      >
        {t(ready ? 'leases.chooseNext' : 'leases.viewLease')}
      </Link>
      <p className="sr-only">
        {t('contract.number')}: {contractNumberFor(lease.id)}
      </p>
    </article>
  );
}

function noteFor(
  lease: CustomerLease,
  locale: Locale,
  t: Translate,
  euro: (cents: number) => string
): string | null {
  if (lease.endOfTermAction) {
    return t('contract.selectedEndAction', {
      action: t(`contract.endAction.${lease.endOfTermAction}`),
    });
  }
  if (lease.endOfTerm.status === 'ready') return t('leases.readyNote');
  if (lease.endOfTerm.reason === 'contract_not_active') return null;
  return t(`contract.end.blocked.${lease.endOfTerm.reason}`, {
    date: formatIsoDate(lease.endsOn, locale),
    amount: euro(lease.endOfTerm.outstandingRentCents),
  });
}
