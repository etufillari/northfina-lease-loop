// The end of term on the contract page: the dates, then either the recorded ending or the form.
import Link from 'next/link';
import type {
  AssetCondition,
  Customer,
  SecondLifeRequest,
  UsageUnit,
  VatRates,
} from '@/data/schemas';
import { endOfTermDates, type EndedContract, type Ending } from '@/domain/end-of-term';
import { formatEuro } from '@/domain/money';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { EndOfTermForm, type EndOfTermFormProps } from './end-of-term-form';

export type EndOfTermSectionProps = {
  locale: Locale;
  contractId: number;
  /** The leased item, for the links onward to its next life and passport. */
  assetId: string;
  contract: EndedContract;
  ending: Ending | null;
  vatRates: VatRates;
  today: string;
  /** The item as delivered; null when the asset row is missing. */
  asset: { condition: AssetCondition; usageValue: number; unit: UsageUnit } | null;
  customers: Customer[];
  /** The waiting list and what it takes to rank it for this item (D-048). */
  passOn: EndOfTermFormProps['passOn'];
  /** The waiting list, to name a request the item was passed on to. */
  demand: SecondLifeRequest[];
  /** True when Leave early is not beside it, so the section has the whole width. */
  standalone: boolean;
};

export function EndOfTermSection(props: EndOfTermSectionProps) {
  const { locale, contract, ending, asset } = props;
  const t = getT(locale);
  const date = (iso: string) => formatIsoDate(iso, locale);
  const dates = endOfTermDates(contract);

  const content = ending ? (
    <EndingSummary {...props} ending={ending} />
  ) : asset ? (
    <EndOfTermForm
      locale={locale}
      contractId={props.contractId}
      contract={contract}
      vatRates={props.vatRates}
      today={props.today}
      delivered={asset}
      personas={props.customers
        .filter((c) => c.id !== contract.customerId)
        .map((c) => ({ id: c.id, name: c.name }))}
      passOn={props.passOn}
    />
  ) : null;
  // Before the choice opens the form lists the same three dates as a timeline, so they aren't
  // repeated here as a sentence.
  const timelineShown = !ending && asset !== null && props.today < dates.opensOn;

  // Beside Leave early it is one card of a pair. On its own it spans the page, so on a wide screen
  // the heading and dates take a column and the form or the recorded ending the rest.
  return (
    <section
      aria-labelledby="end-of-term"
      className={`panel p-5 sm:p-6 ${props.standalone ? 'lg:col-span-2 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-x-10' : ''}`}
    >
      <div>
        <h2 id="end-of-term" className="font-display text-lg font-bold tracking-tight uppercase">
          {t('end.title')}
        </h2>
        {timelineShown ? null : (
          <p className="mt-1 text-sm text-muted">
            {t('end.dates', {
              lastDay: date(dates.lastDay),
              opensOn: date(dates.opensOn),
              handover: date(dates.handoverDate),
            })}
          </p>
        )}
      </div>
      {content ? (
        <div
          className={`mt-5 border-t border-line pt-5 ${props.standalone ? 'lg:mt-0 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10' : ''}`}
        >
          {content}
        </div>
      ) : null}
    </section>
  );
}

function EndingSummary(props: EndOfTermSectionProps & { ending: Ending }) {
  const { locale, ending, asset } = props;
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const date = (iso: string) => formatIsoDate(iso, locale);
  const waiting = props.demand.find((r) => r.id === ending.nextLessee);
  const lessee =
    props.customers.find((c) => c.id === ending.nextLessee)?.name ??
    (waiting ? t('end.waitingName', { who: waiting.who, id: waiting.id }) : undefined);
  const early = ending.earlyExit;
  const earlyPrice = early && (ending.kind === 'early_buy' ? early.buy : early.handBack);
  const invoice =
    ending.buyoutInvoice ??
    (early && earlyPrice
      ? { invoiceDate: ending.effectiveDate, vatRatePercent: early.vatRatePercent, ...earlyPrice }
      : undefined);

  return (
    <div role="status">
      <p className="font-semibold">
        {t(`end.done.${ending.kind}`, {
          date: date(ending.effectiveDate),
          name: lessee ?? ending.nextLessee ?? '',
        })}
      </p>
      {ending.inspection && asset ? (
        <p className="mt-1 text-sm text-muted">
          {t('end.inspection', {
            condition: t(`condition.${ending.inspection.condition}`),
            usage: t(`usage.${asset.unit}`, {
              value: formatNumber(ending.inspection.usageValue, locale),
            }),
          })}
        </p>
      ) : null}
      {invoice ? (
        <dl className="mt-4 grid gap-y-1 text-sm tabular-nums">
          <dt className="eyebrow">
            {t(early ? 'end.exitInvoice' : 'end.buyoutInvoice', {
              date: date(invoice.invoiceDate),
            })}
          </dt>
          <dd className="flex justify-between border-b border-line py-1.5">
            <span className="text-muted">{t('contract.net')}</span>
            {euro(invoice.netCents)}
          </dd>
          <dd className="flex justify-between border-b border-line py-1.5">
            <span className="text-muted">
              {t('contract.vat')} {formatNumber(invoice.vatRatePercent, locale)} %
            </span>
            {euro(invoice.vatCents)}
          </dd>
          <dd className="flex justify-between py-1.5 font-semibold">
            <span>{t('contract.gross')}</span>
            {euro(invoice.grossCents)}
          </dd>
        </dl>
      ) : null}
      <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
        {/* The loop goes on: a handed-back item gets a second life on its own page (D-035). */}
        {ending.kind === 'buy' || ending.kind === 'early_buy' ? null : (
          <Link
            href={`/${locale}/assets/${props.assetId}`}
            className="underline underline-offset-4 hover:text-accent-text"
          >
            {t('end.nextLife')} <span aria-hidden="true">→</span>
          </Link>
        )}
        <Link
          href={`/${locale}/assets/${props.assetId}/passport`}
          className="underline underline-offset-4 hover:text-accent-text"
        >
          {t('passport.link')} <span aria-hidden="true">→</span>
        </Link>
      </p>
    </div>
  );
}
