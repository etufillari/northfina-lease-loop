import Link from 'next/link';
import type { VatRate } from '@/data/schemas';
import { holderShareCents, sharesOn } from '@/domain/co-lease';
import { invoiceAmounts } from '@/domain/lease-billing';
import { summarizeLease } from '@/domain/lease-dashboard';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { CustomerLease } from '@/server/leases';
import { AvatarStack } from './person-avatar';
import { ProductPhoto } from './product-photo';

export function LeaseCard({
  lease,
  rates,
  today,
  locale,
}: {
  lease: CustomerLease;
  rates: VatRate[];
  today: string;
  locale: Locale;
}) {
  const t = getT(locale);
  const info = summarizeLease(lease, rates, today);
  const rate = rates.find(
    (item) => item.valid_from <= today && (item.valid_to === null || item.valid_to >= today)
  );
  const monthly = rate
    ? holderShareCents(
        invoiceAmounts(lease.monthlyNetCents, Math.round(rate.rate_percent * 100)).totalCents,
        lease.coLeaseShares,
        today
      )
    : null;
  const money = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const people = sharesOn(lease.coLeaseShares, today);
  return (
    <article className="flex h-full flex-col rounded-lg border border-hairline bg-canvas p-5">
      <div className="flex items-start gap-4">
        <div className="w-24 shrink-0 sm:w-28">
          <ProductPhoto
            assetId={lease.asset.id}
            productName={`${lease.asset.make} ${lease.asset.model}`}
            locale={locale}
            showCaption={false}
            sizes="112px"
          />
        </div>
        <div className="min-w-0 flex-1">
          {lease.status !== 'active' ? (
            <span
              className={`inline-flex rounded-pill px-2.5 py-1 text-fine font-semibold ${lease.status === 'awaiting_signature' ? 'bg-amber-50 text-amber-900' : 'bg-parchment text-ink-muted'}`}
            >
              {t(`dashboard.status.${lease.status}`)}
            </span>
          ) : null}
          <h3 className="text-body font-semibold wrap-anywhere">
            {lease.asset.make} {lease.asset.model}
          </h3>
          {lease.status === 'active' ? (
            <>
              <p className="mt-2 text-tagline font-semibold tabular-nums">
                {monthly === null
                  ? t('dashboard.forecastUnavailable')
                  : `${money(monthly)} / ${t('dashboard.month')}`}
              </p>
              <p className="mt-2 text-caption text-ink-muted">
                {t('dashboard.endsOn', { date: formatIsoDate(info.endDate, locale) })}
              </p>
            </>
          ) : (
            <p className="mt-2 text-caption text-ink-muted">
              {t(`dashboard.status.${lease.status}`)}
            </p>
          )}
          {people.length > 1 ? (
            <div className="mt-3 flex items-center gap-3">
              <AvatarStack people={people.map(({ user }) => user)} />
              <p className="text-caption text-ink-muted">
                {t('colease.cardNote', { count: people.length })}
              </p>
            </div>
          ) : null}
        </div>
      </div>
      <Link
        className="mt-auto inline-flex min-h-target items-center gap-2 pt-3 text-caption font-semibold text-primary"
        href={`/${locale}/account/leases/${encodeURIComponent(lease.id)}`}
      >
        {t('dashboard.viewLease')} <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}
