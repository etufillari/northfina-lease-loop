// A stored quote: every amount it showed, how long it can be signed, and what today's price list
// would change (D-014, D-034). Server-rendered; the application form below it signs.
import Link from 'next/link';
import type { VatRates } from '@/data/schemas';
import type { PriceCheck } from '@/domain/contract';
import { formatEuro } from '@/domain/money';
import type { Quote } from '@/domain/quote';
import type { QuoteStatus } from '@/domain/signing';
import { formatFactor, formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { vatRateOn, withVat } from '@/domain/vat';
import { PriceOverTerm } from './price-over-term';

export function QuoteSummary(props: {
  locale: Locale;
  quote: Quote;
  status: QuoteStatus;
  contractId: number | null;
  vatRates: VatRates;
  /** Today: a quote signed today starts today, so its invoices are dated from here. */
  today: string;
}) {
  const { locale, quote } = props;
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const date = (iso: string) => formatIsoDate(iso, locale);
  // The headline: what the first invoice would be if signed today (VAT follows the date, D-011).
  const vat = vatRateOn(props.vatRates, props.today);
  const monthly = vat.ok ? withVat(quote.monthlyNetRentCents, vat.ratePercent) : null;

  return (
    <section
      aria-labelledby="quoted"
      className="relative overflow-hidden rounded-xl bg-stage p-6 text-stage-fg sm:p-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <div className="max-w-2xl">
          <h2 id="quoted" className="font-display text-lg font-bold tracking-tight uppercase">
            {t('quote.price')}
          </h2>
          <p className="mt-1 text-sm text-stage-muted">
            {t('quote.madeOn', { date: date(quote.quoteDate), version: quote.priceListVersion })}
          </p>
        </div>
        {monthly && vat.ok ? (
          <div className="text-left sm:text-right">
            <p className="text-xs font-semibold tracking-[0.08em] text-stage-muted uppercase">
              {t('lease.monthly')}
            </p>
            <p className="font-display text-4xl font-extrabold tracking-tight text-stage-accent tabular-nums">
              {euro(monthly.grossCents)}
            </p>
            <p className="text-sm text-stage-muted">
              {t('quote.monthlyHow', {
                net: euro(monthly.netCents),
                rate: formatNumber(vat.ratePercent, locale),
                term: t('lease.months', { count: quote.termMonths }),
              })}
            </p>
          </div>
        ) : null}
      </div>
      <dl className="mt-6 grid gap-x-10 gap-y-1 text-sm sm:grid-cols-2">
        <Fact label={t('lease.listPrice', { version: quote.priceListVersion })}>
          {euro(quote.listPriceCents)}
        </Fact>
        <Fact label={t('lease.minusDown')}>{euro(quote.downPaymentCents)}</Fact>
        <Fact label={t('lease.financed')}>{euro(quote.financedCents)}</Fact>
        <Fact label={t('lease.factor', { band: quote.band })}>
          {formatFactor(quote.factor, locale)}
        </Fact>
        <Fact label={t('lease.net')}>{euro(quote.monthlyNetRentCents)}</Fact>
        <Fact label={t('lease.term')}>{t('lease.months', { count: quote.termMonths })}</Fact>
        <Fact label={t('lease.buyout')}>{euro(quote.buyoutCents)}</Fact>
        <Fact label={t('lease.totalCost')}>{euro(quote.totalNetCostCents)}</Fact>
      </dl>
      {props.status === 'open' ? (
        // The same two columns as the facts above, so the VAT notice lines up with the left one.
        <div className="grid gap-x-10 sm:grid-cols-2">
          <PriceOverTerm
            locale={locale}
            vatRates={props.vatRates}
            startDate={props.today}
            termMonths={quote.termMonths}
            monthlyNetRentCents={quote.monthlyNetRentCents}
            downPaymentCents={quote.downPaymentCents}
            tone="stage"
          />
        </div>
      ) : null}
      <p className="mt-6 text-sm font-semibold">
        {props.status === 'used' && props.contractId !== null ? (
          <Link href={`/${locale}/contracts/${props.contractId}`} className="underline">
            {t('quote.status.used')}
          </Link>
        ) : (
          t(`quote.status.${props.status}`, {
            date: date(props.status === 'not_yet_valid' ? quote.quoteDate : quote.validUntil),
          })
        )}
      </p>
    </section>
  );
}

/** What signing today changes: a lower price is offered, a higher one doesn't apply. */
export function PriceCheckNotice(props: { locale: Locale; quote: Quote; check: PriceCheck }) {
  const { locale, quote, check } = props;
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  if (check.kind === 'unchanged') return null;

  return (
    <p
      role="status"
      className="mt-6 rounded-md bg-warn-bg p-4 text-sm text-warn-fg ring-1 ring-warn-line ring-inset"
    >
      {check.kind === 'cheaper_today'
        ? t('quote.cheaperToday', {
            rent: euro(check.requote.monthlyNetRentCents),
            saving: euro(check.savingPerMonthCents),
            version: check.requote.priceListVersion,
            quoted: euro(quote.monthlyNetRentCents),
          })
        : t('quote.dearerToday', {
            extra: euro(check.extraPerMonthCents),
            rent: euro(quote.monthlyNetRentCents),
          })}
    </p>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/10 py-1.5">
      <dt className="text-stage-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{children}</dd>
    </div>
  );
}
