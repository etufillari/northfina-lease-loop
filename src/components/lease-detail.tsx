import type { Co2Factors, VatRate } from '@/data/schemas';
import { holderShareCents, sharesOn } from '@/domain/co-lease';
import { invoiceAmounts, paymentStatus } from '@/domain/lease-billing';
import { paidForInvoice, summarizeLease } from '@/domain/lease-dashboard';
import { forecastPaymentChanges } from '@/domain/forecast-changes';
import { endOfTerm } from '@/domain/end-of-term';
import { reuseEstimate } from '@/domain/lease-insights';
import { VatChangeNote } from './vat-change-note';
import { formatEuro } from '@/domain/money';
import Link from 'next/link';
import { TermEndedNotice } from './term-ended-notice';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { CustomerLease } from '@/server/leases';
import {
  recoveryCalculationSchema,
  recoveryReportSchema,
  type RecoveryCalculation,
} from '@/server/recovery-input';
import { LeaseRequestControls, ReturnQuoteAccept } from './lease-controls';
import { AvatarStack } from './person-avatar';
import { SignatoryStatus, type SigningInfo } from './signatory-status';
import { ProductPhoto } from './product-photo';
import { ProgressBar } from './progress-bar';
import { quoteBreakdown, ReturnBreakdown } from './return-breakdown';

type Props = {
  locale: Locale;
  lease: CustomerLease;
  rates: VatRate[];
  factors: Co2Factors;
  today: string;
  liveBuyoutTotalCents?: number;
  /** Set while the contract waits for the company's signatory (card 6). */
  signing?: SigningInfo;
};
const panel = 'rounded-lg border border-hairline bg-canvas p-5 sm:p-6';

export function LeaseDetail({
  locale,
  lease,
  rates,
  factors,
  today,
  liveBuyoutTotalCents,
  signing,
}: Props) {
  const t = getT(locale);
  const info = summarizeLease(lease, rates, today);
  const people = sharesOn(lease.coLeaseShares, today);
  const termEnd = endOfTerm(lease, today);
  const currency = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const endRate = rates.find(
    (rate) =>
      rate.valid_from <= info.endDate && (rate.valid_to === null || rate.valid_to >= info.endDate)
  );
  const gross = (cents: number, rate: VatRate | undefined) =>
    rate
      ? currency(invoiceAmounts(cents, Math.round(rate.rate_percent * 100)).totalCents)
      : t('dashboard.forecastUnavailable');
  const returnRequest = lease.requests.find(
    (request) => request.assessment && request.status !== 'cancelled'
  );
  const assessment = returnRequest?.assessment;
  const paidReturn = lease.actionPayments.some((payment) => payment.kind === 'return');
  let quote: RecoveryCalculation | null = null;
  if (assessment) {
    try {
      const parsed = recoveryCalculationSchema.safeParse(JSON.parse(assessment.calculationJson));
      if (parsed.success) quote = parsed.data;
    } catch {
      /* A missing quote remains unavailable rather than displaying invented numbers. */
    }
  }
  const exchange = lease.requests.find(
    (request) =>
      request.kind === 'exchange' && request.status !== 'cancelled' && request.customerReportJson
  );
  let exchangeQuote: { name: string; monthlyTotalCents: number; termMonths: number } | null = null;
  if (exchange?.customerReportJson) {
    try {
      const report = recoveryReportSchema.safeParse(JSON.parse(exchange.customerReportJson));
      if (report.success) exchangeQuote = report.data.replacementQuote ?? null;
    } catch {
      /* No invented replacement price. */
    }
  }
  const pending = lease.requests.some(
    (request) =>
      request.status === 'pending' ||
      (request.assessment && ['quoted', 'accepted'].includes(request.assessment.status))
  );
  const forecastPeriods =
    info.forecast.ok && lease.status === 'active'
      ? forecastPaymentChanges(
          info.forecast.invoices,
          lease.invoices
            .filter((invoice) => invoice.status === 'issued')
            .map((invoice) => invoice.dueDate),
          today
        )
      : [];
  // Each payment as vatChange compares them: the one before is the previous period or invoice.
  const issuedPayments = lease.invoices
    .filter((invoice) => invoice.status === 'issued')
    .map((invoice) => ({ ...invoice, totalCents: invoice.netCents + invoice.vatCents }));
  const impact = reuseEstimate(
    lease.asset.category,
    lease.asset.condition,
    lease.asset.previous_lives,
    factors
  );
  const timeline = [
    ...lease.events.map((event) => ({
      id: event.id,
      date: event.eventDate,
      label: t(`dashboard.event.${event.kind}`),
    })),
    ...lease.invoices
      .filter((invoice) => invoice.status === 'issued')
      .map((invoice) => ({
        id: invoice.id,
        date: invoice.issuedDate,
        label: t('dashboard.event.invoice'),
      })),
    ...lease.requests.map((request) => ({
      id: request.id,
      date: request.createdAt.toISOString().slice(0, 10),
      label: t(`dashboard.request.${request.kind}`),
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="mt-5 grid items-start gap-6 desktop:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        {exchangeQuote ? (
          <section className={panel}>
            <h3 className="text-tagline font-semibold">{t('flow.exchangeTitle')}</h3>
            <p className="mt-3 font-semibold">{exchangeQuote.name}</p>
            <p className="mt-2">
              {t('flow.newMonthly')}: {currency(exchangeQuote.monthlyTotalCents)}
            </p>
            <p className="mt-2 text-caption text-ink-muted">
              {t('product.months', { count: exchangeQuote.termMonths })} ·{' '}
              {t('flow.replacementNote')}
            </p>
          </section>
        ) : null}
        {signing ? <SignatoryStatus t={t} signing={signing} /> : null}
        {termEnd.ended && !pending ? (
          <TermEndedNotice
            locale={locale}
            leaseId={lease.id}
            endDate={termEnd.endDate}
            itemName={`${lease.asset.make} ${lease.asset.model}`}
            buyoutTotal={
              liveBuyoutTotalCents !== undefined
                ? currency(liveBuyoutTotalCents)
                : gross(lease.buyoutCents, endRate)
            }
          />
        ) : null}
        <section className={panel}>
          <div className="flex items-start gap-5">
            <div className="w-28 shrink-0 sm:w-40">
              <ProductPhoto
                assetId={lease.asset.id}
                productName={`${lease.asset.make} ${lease.asset.model}`}
                locale={locale}
                showCaption={false}
                sizes="160px"
              />
            </div>
            <div className="min-w-0">
              {lease.status !== 'active' ? (
                <span
                  className={`inline-flex rounded-pill px-2.5 py-1 text-fine font-semibold ${lease.status === 'awaiting_signature' ? 'bg-amber-50 text-amber-900' : 'bg-parchment text-ink-muted'}`}
                >
                  {t(`dashboard.status.${lease.status}`)}
                </span>
              ) : null}
              <h2 className="text-tagline font-semibold wrap-anywhere">
                {lease.asset.make} {lease.asset.model}
              </h2>
            </div>
          </div>
          {lease.status === 'active' ? (
            <div className="mt-5 border-t border-divider pt-5">
              <ProgressBar
                label={t('dashboard.progress')}
                value={info.yourPaidCents}
                max={info.yourPaidCents + info.yourRemainingCents}
              />
              <div className="mt-2 flex flex-wrap justify-between gap-x-6 gap-y-1 text-caption">
                <span>{t('dashboard.paidOf', { amount: currency(info.yourPaidCents) })}</span>
                <span className="font-semibold">
                  {t('dashboard.leftToPay', { amount: currency(info.yourRemainingCents) })}
                </span>
              </div>
              <p className="mt-2 text-caption text-ink-muted">
                {info.paymentsLeft === 1
                  ? t('dashboard.paymentLeft')
                  : t('dashboard.paymentsLeft', { count: info.paymentsLeft })}{' '}
                · {t('dashboard.endsOn', { date: formatIsoDate(info.endDate, locale) })}
              </p>
              <p className="mt-2 text-caption text-ink-muted">
                {t('priceLock.locked', { version: lease.priceListVersion })}
              </p>
              {lease.quotedOn &&
              lease.quotedPriceCents !== null &&
              lease.quotedPriceListVersion !== null ? (
                <p className="mt-1 text-caption text-ink-muted">
                  {t('priceLock.quoted', {
                    quoted: formatEuro(lease.quotedPriceCents, intlLocale[locale]),
                    quotedVersion: lease.quotedPriceListVersion,
                    quotedDate: formatIsoDate(lease.quotedOn, locale),
                    price: formatEuro(lease.listPriceCents, intlLocale[locale]),
                  })}
                </p>
              ) : null}
              {lease.signatoryEmail && lease.signedOn ? (
                <p className="mt-2 text-caption text-ink-muted wrap-anywhere">
                  {t('signing.signedBy', {
                    email: lease.signatoryEmail,
                    date: formatIsoDate(lease.signedOn, locale),
                  })}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        {assessment && returnRequest ? (
          <section className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-tagline font-semibold">
                {t(returnRequest.kind === 'buyout' ? 'return.buyoutTitle' : 'return.requestTitle')}
              </h3>
              <span className="rounded-pill bg-parchment px-3 py-1 text-caption">
                {t(`return.stage.${assessment.status}` as MessageKey)}
              </span>
            </div>
            {quote ? (
              <>
                <p className="mt-4 text-caption text-ink-muted">
                  {t(
                    returnRequest.kind === 'buyout'
                      ? 'return.buyoutNow'
                      : paidReturn
                        ? 'flow.amountPaid'
                        : 'flow.returnTotal'
                  )}
                </p>
                <p className="mt-1 text-display-sm font-semibold">
                  {currency(
                    returnRequest.kind === 'buyout'
                      ? quote.settlement.buyoutTotalCents
                      : quote.settlement.returnTotalCents
                  )}
                </p>
                <p className="mt-2 text-caption text-ink-muted">
                  {t('pricing.includesVat')}
                  {assessment.status === 'quoted'
                    ? ` · ${t('return.quoteNote', { date: formatIsoDate(quote.quoteDate, locale) })}`
                    : ''}
                </p>
                {returnRequest.kind === 'buyout' ? (
                  <details className="mt-4 border-t border-divider pt-4">
                    <summary className="cursor-pointer text-caption font-semibold text-primary">
                      {t('return.calculation')}
                    </summary>
                    <p className="mt-3 text-caption text-ink-muted">{t('return.buyoutMethod')}</p>
                  </details>
                ) : (
                  <ReturnBreakdown
                    locale={locale}
                    currency={currency}
                    data={quoteBreakdown(locale, quote)}
                  />
                )}
                {assessment.status === 'quoted' && quote.quoteDate === today ? (
                  <ReturnQuoteAccept
                    locale={locale}
                    id={lease.id}
                    requestId={returnRequest.id}
                    expectedAssessmentUpdatedAt={assessment.updatedAt.toISOString()}
                    action={returnRequest.kind === 'buyout' ? 'buyout' : 'accept'}
                    payCents={
                      returnRequest.kind !== 'buyout' && lease.isDemo
                        ? quote.settlement.returnTotalCents
                        : 0
                    }
                  />
                ) : null}
                {assessment.status === 'quoted' && quote.quoteDate !== today ? (
                  <p className="mt-3 text-caption">{t('return.quoteExpired')}</p>
                ) : null}
              </>
            ) : null}
            {assessment.status === 'accepted' ? (
              <p className="mt-4 text-caption text-ink-muted">{t('return.acceptedNote')}</p>
            ) : null}
          </section>
        ) : null}

        <section className={panel}>
          <h3 className="text-tagline font-semibold">{t('dashboard.paymentDetails')}</h3>
          <details className="mt-4 border-t border-divider pt-4">
            <summary className="cursor-pointer text-body font-semibold">
              {t('dashboard.forecastSchedule')}
            </summary>
            <p className="mt-3 text-caption text-ink-muted">{t('dashboard.forecastChangesNote')}</p>
            {info.forecast.ok ? (
              forecastPeriods.length ? (
                <ul className="mt-2 divide-y divide-divider">
                  {forecastPeriods.map((period, index) => (
                    <li key={period.startDate} className="py-4 text-caption">
                      <div className="flex flex-wrap justify-between gap-3">
                        <p>
                          <time dateTime={period.startDate}>
                            {formatIsoDate(period.startDate, locale)}
                          </time>
                          {period.endDate !== period.startDate ? (
                            <>
                              {' '}
                              –{' '}
                              <time dateTime={period.endDate}>
                                {formatIsoDate(period.endDate, locale)}
                              </time>
                            </>
                          ) : null}
                        </p>
                        <p className="font-semibold">
                          {currency(period.totalCents)} / {t('dashboard.month')}
                        </p>
                      </div>
                      <p className="mt-1 text-fine text-ink-muted">
                        {t('dashboard.vatRate', {
                          rate: formatNumber(period.vatBasisPoints / 100, locale),
                        })}
                      </p>
                      <VatChangeNote
                        previous={
                          index
                            ? { ...forecastPeriods[index - 1]!, dueDate: period.startDate }
                            : issuedPayments.at(-1)
                        }
                        payment={{ ...period, dueDate: period.startDate }}
                        rates={rates}
                        locale={locale}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-caption">{t('dashboard.noForecastPayments')}</p>
              )
            ) : (
              <p className="mt-3 text-caption">{t('dashboard.forecastUnavailable')}</p>
            )}
          </details>
          <details className="mt-4 border-t border-divider pt-4">
            <summary className="cursor-pointer text-body font-semibold">
              {t('dashboard.issuedInvoices')}
            </summary>
            {lease.invoices.filter((invoice) => invoice.status === 'issued').length ? (
              <ul className="mt-2 divide-y divide-divider">
                {lease.invoices
                  .filter((invoice) => invoice.status === 'issued')
                  .map((invoice, index) => {
                    const total = invoice.netCents + invoice.vatCents;
                    const paid = paidForInvoice(invoice, lease.isDemo);
                    return (
                      <li key={invoice.id} className="py-4 text-caption">
                        <div className="flex flex-wrap justify-between gap-3">
                          <time dateTime={invoice.dueDate}>
                            {formatIsoDate(invoice.dueDate, locale)}
                          </time>
                          <p className="font-semibold">
                            {currency(total)} ·{' '}
                            {t(
                              `dashboard.invoiceStatus.${paymentStatus(total, paid, invoice.dueDate, today)}`
                            )}
                          </p>
                        </div>
                        <p className="mt-2 text-fine text-ink-muted">
                          {t('dashboard.vatBreakdown', {
                            net: currency(invoice.netCents),
                            rate: formatNumber(invoice.vatBasisPoints / 100, locale),
                            vat: currency(invoice.vatCents),
                          })}
                        </p>
                        <VatChangeNote
                          previous={issuedPayments[index - 1]}
                          payment={issuedPayments[index]!}
                          rates={rates}
                          locale={locale}
                        />
                        <p className="mt-1 text-fine text-ink-muted">
                          {t('dashboard.paidAmount', { amount: currency(paid) })}
                        </p>
                        {sharesOn(lease.coLeaseShares, invoice.dueDate).length > 1 ? (
                          <p className="mt-1 text-fine text-ink-muted">
                            {t('colease.yourShare', {
                              amount: currency(
                                holderShareCents(total, lease.coLeaseShares, invoice.dueDate)
                              ),
                            })}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
              </ul>
            ) : (
              <p className="mt-3 text-caption text-ink-muted">{t('dashboard.noInvoices')}</p>
            )}
          </details>
          <Link
            href={`/${locale}/account/leases/${encodeURIComponent(lease.id)}/agreement`}
            className="mt-4 flex min-h-target items-center border-t border-divider pt-4 text-body font-semibold text-primary"
          >
            {t('agreement.link')}&nbsp;<span aria-hidden="true">→</span>
          </Link>
        </section>

        <section className={panel}>
          <h3 className="text-tagline font-semibold">{t('dashboard.passport')}</h3>
          <dl className="mt-5 grid grid-cols-2 gap-5">
            <Fact label={t('condition.label')} value={t(`condition.${lease.asset.condition}`)} />
            <Fact label={t('asset.modelYear')} value={String(lease.asset.model_year)} />
            <Fact
              label={t('asset.previousLives')}
              value={formatNumber(lease.asset.previous_lives, locale)}
            />
            <Fact
              label={t('asset.usage')}
              value={t(`usage.${lease.asset.usage_unit}`, {
                value: formatNumber(lease.asset.usage_value, locale),
              })}
            />
          </dl>
          {lease.asset.previous_lives ? (
            <div className="mt-5 border-t border-divider pt-4">
              <p className="text-caption text-ink-muted">{t('dashboard.impactTitle')}</p>
              <p className="mt-2 text-tagline font-semibold">
                {t('dashboard.impactValue', { amount: formatNumber(impact, locale) })}
              </p>
              <p className="mt-2 text-caption text-ink-muted">{t('dashboard.impactNote')}</p>
            </div>
          ) : null}
        </section>
        <details className={panel}>
          <summary className="cursor-pointer text-body font-semibold">
            {t('dashboard.timeline')}
          </summary>
          {timeline.length ? (
            <ol className="mt-4 space-y-4">
              {timeline.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-wrap justify-between gap-3 border-l-2 border-hairline pl-4 text-caption"
                >
                  <p>{event.label}</p>
                  <time className="text-ink-muted" dateTime={event.date}>
                    {formatIsoDate(event.date, locale)}
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-caption text-ink-muted">{t('dashboard.noEvents')}</p>
          )}
        </details>
      </div>

      <aside className={`${panel} desktop:sticky desktop:top-40`}>
        <h3 className="text-tagline font-semibold">{t('dashboard.yourNumbers')}</h3>
        <p className="mt-5 text-caption text-ink-muted">{t('dashboard.nextPayment')}</p>
        <p className="mt-1 text-display-sm font-semibold tabular-nums">
          {lease.status === 'active' && info.next
            ? currency(info.next.shareCents)
            : t('dashboard.noNext')}
        </p>
        {lease.status === 'active' && info.next ? (
          <p className="mt-2 text-caption text-ink-muted">
            {formatIsoDate(info.next.dueDate, locale)}
            {info.next.kind === 'issued' ? ` · ${t('dashboard.issued')}` : ''}
          </p>
        ) : null}
        {lease.status === 'active' && info.next && people.length > 1 ? (
          <p className="mt-1 text-caption text-ink-muted">
            {t('colease.ofTotal', { amount: currency(info.next.amountCents) })}
          </p>
        ) : null}
        {info.outstandingCents > 0 ? (
          <p className="mt-4 rounded-sm bg-parchment p-3 text-caption font-semibold">
            {t('dashboard.overdueNote', { amount: currency(info.outstandingCents) })}
          </p>
        ) : null}
        {lease.status === 'active' ? (
          <div className="mt-5 border-t border-divider pt-5">
            <h3 className="text-body font-semibold">{t('colease.title')}</h3>
            {people.length > 1 ? (
              <div className="mt-3">
                <AvatarStack people={people.map(({ user }) => user)} />
              </div>
            ) : null}
            <Link
              href={`/${locale}/account/leases/${encodeURIComponent(lease.id)}/co-lease`}
              className="mt-2 inline-flex min-h-target items-center text-caption font-semibold text-primary"
            >
              {t(people.length > 1 ? 'colease.manage' : 'colease.start')}{' '}
              <span aria-hidden="true">&nbsp;→</span>
            </Link>
          </div>
        ) : null}
        <div className="mt-5 border-t border-divider pt-5">
          <h3 className="text-body font-semibold">{t('dashboard.manage')}</h3>
          <LeaseRequestControls
            locale={locale}
            id={lease.id}
            disabled={pending || lease.status !== 'active'}
            active={lease.status === 'active' && !paidReturn}
          />
        </div>
      </aside>
    </div>
  );
}
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd className="mt-1 text-body font-semibold wrap-anywhere">{value}</dd>
    </div>
  );
}
