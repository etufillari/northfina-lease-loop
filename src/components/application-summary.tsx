'use client';
// The running summary of what the customer is applying for: the items, the term and the
// money. Sits next to the questions, and in the middle of the page once there is a decision.
import { formatEuro } from '@/domain/money';
import { grossCents } from '@/domain/vat';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export type SummaryQuote = {
  assetIds: string[];
  assets: Array<{ id: string; make: string; model: string }>;
  termMonths: number;
  downPaymentCents: number;
  listPriceCents: number;
  monthlyNetRentCents: number;
  netTotalCents: number;
  buyoutNetCents: number;
  /** Set for a take-over: what is left of the lease is what the successor commits to. */
  takeOver: { monthsLeft: number; stillToPayNetCents: number } | null;
};

export function ApplicationSummary({
  locale,
  quote,
  startDate,
  pricesInclVat,
  vatRate,
}: {
  locale: Locale;
  quote: SummaryQuote;
  /** Shown once chosen (at submission); null while the questions are still running. */
  startDate: string | null;
  /** Consumers and guests see every amount with VAT; businesses net (src/domain/vat.ts). */
  pricesInclVat: boolean;
  /** Today's rate, for the gross view; null when none is known (then net is shown). */
  vatRate: { ratePercent: number; rateBasisPoints: number } | null;
}) {
  const t = getT(locale);
  const showGross = pricesInclVat && vatRate !== null;
  const euro = (cents: number) =>
    formatEuro(showGross ? grossCents(cents, vatRate.rateBasisPoints) : cents, intlLocale[locale]);

  return (
    <section
      aria-label={t('apply.summary.title')}
      className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-800 dark:bg-emerald-950/30"
    >
      <h2 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
        {t('apply.summary.title')}
      </h2>
      <ul className="mt-3 space-y-1 text-sm">
        {quote.assets.map((asset) => (
          <li key={asset.id} className="font-medium">
            {asset.make} {asset.model}
          </li>
        ))}
      </ul>
      <dl className="mt-4 space-y-1.5 border-t border-emerald-100 pt-3 text-sm dark:border-emerald-900">
        {quote.takeOver ? (
          <>
            <Row
              label={t('transfer.monthsLeft')}
              value={t('price.months', { months: quote.takeOver.monthsLeft })}
            />
            <Row
              label={t('price.netRent')}
              value={`${euro(quote.monthlyNetRentCents)} ${t('common.perMonth')}`}
              bold
            />
            <Row label={t('transfer.stillToPay')} value={euro(quote.takeOver.stillToPayNetCents)} />
          </>
        ) : (
          <>
            <Row label={t('price.term')} value={t('price.months', { months: quote.termMonths })} />
            <Row label={t('price.listPrice')} value={euro(quote.listPriceCents)} />
            <Row label={t('price.downPayment')} value={euro(quote.downPaymentCents)} />
            <Row
              label={t('price.netRent')}
              value={`${euro(quote.monthlyNetRentCents)} ${t('common.perMonth')}`}
              bold
            />
            <Row label={t('apply.summary.netTotal')} value={euro(quote.netTotalCents)} />
          </>
        )}
        <Row label={t('price.buyout')} value={euro(quote.buyoutNetCents)} />
        {startDate ? (
          <Row label={t('apply.startDate')} value={formatIsoDate(startDate, locale)} />
        ) : null}
      </dl>
      <p className="mt-3 text-xs text-stone-600 dark:text-stone-400">
        {showGross
          ? t('apply.summary.noteGross', { rate: vatRate.ratePercent })
          : t('apply.summary.note')}
      </p>
    </section>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${bold ? 'font-semibold' : ''}`}>
      <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
}
