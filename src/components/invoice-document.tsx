// One invoice as a document, styled to print cleanly like the contract (site header, footer and
// buttons are hidden in print).
import type { ReactNode } from 'react';
import type { Asset } from '@/data/schemas';
import type { InvoiceWithStatus } from '@/domain/invoicing';
import { formatEuro } from '@/domain/money';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

type InvoiceDocumentProps = {
  label: string;
  contractLabel: string;
  invoice: InvoiceWithStatus;
  termMonths: number;
  customerName: string;
  customerEmail: string | null;
  businessId: string | null;
  asset: Asset;
  locale: Locale;
  t: Translate;
};

export function InvoiceDocument(props: InvoiceDocumentProps) {
  const { invoice, asset, locale, t } = props;
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const date = (iso: string) => formatIsoDate(iso, locale);

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-10 dark:border-stone-800 dark:bg-stone-900 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-6 dark:border-stone-800">
        <div>
          <p className="text-sm text-stone-600 dark:text-stone-400">{t('brand.name')}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('invoice.title')}
          </h1>
        </div>
        <div className="text-right text-sm">
          <p className="text-stone-600 dark:text-stone-400">{t('invoice.number')}</p>
          <p className="font-mono font-semibold">{props.label}</p>
          <p
            className={
              'mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold ' +
              (invoice.status === 'paid'
                ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100'
                : 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100')
            }
          >
            {invoice.paidAtSigning && invoice.paidDate
              ? t('invoice.paidAtSigning', { date: date(invoice.paidDate) })
              : invoice.status === 'paid' && invoice.paidDate
                ? t('invoice.paidOn', { date: date(invoice.paidDate) })
                : t(`invoices.state.${invoice.status}`)}
          </p>
        </div>
      </header>

      <Block title={t('invoice.billedTo')}>
        <p className="font-medium">{props.customerName}</p>
        {props.businessId ? (
          <p className="text-sm">
            {t('contract.businessId')}: {props.businessId}
          </p>
        ) : null}
        {props.customerEmail ? <p className="text-sm">{props.customerEmail}</p> : null}
      </Block>

      <Block title={t('invoice.details')}>
        <Row label={t('invoice.date')} value={date(invoice.dueDate)} />
        <Row label={t('invoice.dueDate')} value={date(invoice.dueDate)} />
        <Row label={t('contract.number')} value={props.contractLabel} />
        <Row
          label={t('invoice.month')}
          value={t('invoice.monthValue', { number: invoice.number, total: props.termMonths })}
        />
      </Block>

      <Block title={t('invoice.lines')}>
        <div className="flex justify-between gap-4 border-b border-stone-100 py-2 text-sm dark:border-stone-800">
          <span>
            {t('invoice.rentFor', { item: `${asset.make} ${asset.model}` })}
            <span className="block text-stone-600 dark:text-stone-400">
              {date(invoice.periodStart)} – {date(invoice.periodEnd)}
            </span>
          </span>
          <span className="tabular-nums">{euro(invoice.netCents)}</span>
        </div>
        <Row
          label={t('invoice.vatLine', { percent: formatNumber(invoice.vatPercent, locale) })}
          value={euro(invoice.vatCents)}
        />
        <div className="flex justify-between gap-4 pt-3 text-lg font-semibold">
          <span>{t('invoice.total')}</span>
          <span className="tabular-nums">{euro(invoice.totalCents)}</span>
        </div>
      </Block>

      <p className="mt-6 text-xs text-stone-600 dark:text-stone-400">{t('invoice.vatRule')}</p>
    </article>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h2 className="text-sm font-semibold tracking-wide text-stone-600 uppercase dark:text-stone-400">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-stone-100 py-1.5 text-sm dark:border-stone-800">
      <span className="text-stone-600 dark:text-stone-400">{label}</span>
      <span className="text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}
