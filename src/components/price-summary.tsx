// The result of the sliders: the monthly rent, what it adds up to, and anything worth a warning.
import Link from 'next/link';
import { formatEuro } from '@/domain/money';
import type { PricedQuote } from '@/domain/quote-costs';
import type { LowerRentOption } from '@/domain/quote-options';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

type PriceSummaryProps = {
  quote: PricedQuote;
  lowerRent: LowerRentOption | null;
  onUseLowerRent: (downPaymentCents: number) => void;
  applyHref: string;
  locale: Locale;
};

export function PriceSummary({
  quote,
  lowerRent,
  onUseLowerRent,
  applyHref,
  locale,
}: PriceSummaryProps) {
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const percent = (value: number) => formatNumber(value, locale);
  const { firstRent, firstVatChange } = quote;

  return (
    <section
      aria-labelledby="price-summary-title"
      className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm dark:border-emerald-900 dark:bg-stone-900"
    >
      <h2 id="price-summary-title" className="font-medium">
        {t('price.result.monthly')}
      </h2>
      <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">
        {euro(firstRent.grossCents)}
      </p>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        {t('price.result.withVat', { rate: percent(firstRent.vatRatePercent) })}
        {' · '}
        <span className="tabular-nums">
          {t('price.result.net', { amount: euro(firstRent.netCents) })}
        </span>
      </p>
      {/* Read out once per change. The rows below would be too much on every slider step. */}
      <p aria-live="polite" className="sr-only">
        {t('price.result.live', { amount: euro(firstRent.grossCents) })}
      </p>

      <dl className="mt-5 grid gap-2 border-t border-stone-100 pt-4 text-sm dark:border-stone-800">
        <Row label={t('price.result.financed')} value={euro(quote.financedCents)} />
        <Row label={t('price.result.contractNet')} value={euro(quote.contractNetTotalCents)} />
        <Row label={t('price.result.contractGross')} value={euro(quote.totals.grossCents)} />
        <Row label={t('price.result.buyout')} value={euro(quote.buyout.grossCents)} />
        <Row
          label={t('price.result.totalWithBuyout')}
          value={euro(quote.totalWithBuyoutGrossCents)}
        />
      </dl>

      {firstVatChange ? (
        <p className="mt-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-950 dark:bg-sky-950 dark:text-sky-100">
          {t('price.note.vatChange', {
            from: percent(firstVatChange.fromPercent),
            to: percent(firstVatChange.toPercent),
            date: formatIsoDate(firstVatChange.invoiceDate, locale),
            net: euro(firstRent.netCents),
          })}
        </p>
      ) : null}

      {lowerRent ? (
        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
          <p>
            {t('price.note.lowerRent', {
              down: euro(lowerRent.downPaymentCents),
              rent: euro(lowerRent.monthlyNetRentCents),
            })}
          </p>
          <button
            type="button"
            onClick={() => onUseLowerRent(lowerRent.downPaymentCents)}
            className="mt-2 rounded-lg bg-amber-800 px-3 py-1.5 font-medium text-white hover:bg-amber-900"
          >
            {t('price.note.useLower', { down: euro(lowerRent.downPaymentCents) })}
          </button>
        </div>
      ) : null}

      <Link
        href={applyHref}
        className="mt-5 block rounded-lg bg-emerald-700 px-4 py-2.5 text-center font-medium text-white hover:bg-emerald-800"
      >
        {t('price.continue')}
      </Link>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
