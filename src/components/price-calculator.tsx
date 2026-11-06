'use client';

// Spine step 2: pick a term and a down payment with sliders and watch the monthly price update.
// All maths is in src/domain/pricing.ts; this component only holds the two slider values.
// They are mirrored into the URL (?term=&down=), so a reload or a language switch keeps them.
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { CoefficientTable } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import { DEFAULT_TERM_MONTHS, type PriceSelection } from '@/domain/price-selection';
import { downPaymentRange, leaseTerms, quoteLease, type LeaseQuote } from '@/domain/pricing';
import { formatNumber } from '@/i18n/format';
import { getT, type Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

type PriceCalculatorProps = {
  assetId: string;
  listPriceCents: number;
  /** VAT on today's date, looked up by the server. */
  vatPercent: number;
  table: CoefficientTable;
  /** Slider positions read from the URL by the server, already validated. */
  initial: PriceSelection;
  locale: Locale;
};

/** Writes the slider positions into the URL, keeping any other params (the catalogue filters). */
function rememberInUrl(selection: PriceSelection) {
  const params = new URLSearchParams(window.location.search);
  params.set('term', String(selection.termMonths));
  params.set('down', String(selection.downPaymentCents));
  window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
}

export function PriceCalculator(props: PriceCalculatorProps) {
  const { assetId, listPriceCents, vatPercent, table, initial, locale } = props;
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);

  const terms = leaseTerms(table);
  const range = downPaymentRange(listPriceCents, table);
  const [termIndex, setTermIndex] = useState(() => Math.max(0, terms.indexOf(initial.termMonths)));
  const [downPaymentCents, setDownPaymentCents] = useState(initial.downPaymentCents);

  function changeTerm(index: number) {
    setTermIndex(index);
    rememberInUrl({ termMonths: terms[index] ?? DEFAULT_TERM_MONTHS, downPaymentCents });
  }

  function changeDownPayment(cents: number) {
    setDownPaymentCents(cents);
    rememberInUrl({ termMonths: terms[termIndex] ?? DEFAULT_TERM_MONTHS, downPaymentCents: cents });
  }

  if (!range.ok) {
    const lowest = Math.min(...table.bands.map((b) => b.min_financed_cents));
    return (
      <Panel t={t}>
        <p className="mt-3 text-stone-700 dark:text-stone-300">
          {t('price.cannotLease', { min: euro(lowest) })}
        </p>
      </Panel>
    );
  }

  const termMonths = terms[termIndex] ?? DEFAULT_TERM_MONTHS;
  const result = quoteLease({ listPriceCents, downPaymentCents, termMonths, vatPercent }, table);
  const fixedDownPayment = range.minCents === range.maxCents;

  return (
    <Panel t={t}>
      <div className="mt-4 grid gap-8 lg:grid-cols-2">
        <div>
          <p aria-live="polite" className="tabular-nums">
            <span className="text-4xl font-semibold">
              {result.ok ? euro(result.quote.monthlyGrossCents) : '–'}
            </span>{' '}
            <span className="text-stone-600 dark:text-stone-400">{t('price.perMonth')}</span>
            {result.ok ? (
              <span className="mt-1 block text-sm text-stone-600 dark:text-stone-400">
                {t('price.exclVat', { amount: euro(result.quote.monthlyNetCents) })}
              </span>
            ) : null}
          </p>

          <label className="mt-8 block">
            <span className="flex justify-between text-sm font-medium">
              {t('price.term')}
              <span className="tabular-nums">{t('price.months', { months: termMonths })}</span>
            </span>
            <input
              type="range"
              min={0}
              max={terms.length - 1}
              step={1}
              value={termIndex}
              onChange={(event) => changeTerm(Number(event.target.value))}
              aria-valuetext={t('price.months', { months: termMonths })}
              className="mt-3 w-full accent-emerald-700"
            />
            <span
              aria-hidden="true"
              className="mt-1 flex justify-between text-xs text-stone-600 dark:text-stone-400"
            >
              {terms.map((months) => (
                <span key={months}>{months}</span>
              ))}
            </span>
          </label>

          <label className="mt-6 block">
            <span className="flex justify-between text-sm font-medium">
              {t('price.downPayment')}
              <span className="tabular-nums">{euro(downPaymentCents)}</span>
            </span>
            <input
              type="range"
              min={range.minCents}
              max={range.maxCents}
              step={range.stepCents}
              value={downPaymentCents}
              disabled={fixedDownPayment}
              onChange={(event) => changeDownPayment(Number(event.target.value))}
              aria-valuetext={euro(downPaymentCents)}
              className="mt-3 w-full accent-emerald-700 disabled:opacity-50"
            />
            <span
              aria-hidden="true"
              className="mt-1 flex justify-between text-xs text-stone-600 dark:text-stone-400"
            >
              <span>{euro(range.minCents)}</span>
              <span>{euro(range.maxCents)}</span>
            </span>
          </label>
          {range.minCents > 0 ? (
            <p className="mt-3 text-sm text-amber-900 dark:text-amber-200">
              {t('price.minDownPayment', {
                amount: euro(range.minCents),
                max: euro(Math.max(...table.bands.map((b) => b.max_financed_cents))),
              })}
            </p>
          ) : null}
          {fixedDownPayment ? (
            <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
              {t('price.noDownPayment')}
            </p>
          ) : null}
        </div>

        <div>
          {result.ok ? (
            <Breakdown quote={result.quote} locale={locale} t={t} />
          ) : (
            <p className="text-stone-700 dark:text-stone-300">{t('price.cannotQuote')}</p>
          )}
        </div>
      </div>

      {result.ok ? (
        <Link
          href={`/${locale}/apply?asset=${assetId}&term=${termMonths}&down=${downPaymentCents}`}
          className="mt-8 inline-block rounded-lg bg-emerald-700 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-stone-900"
        >
          {t('price.apply')}
        </Link>
      ) : null}
    </Panel>
  );
}

function Panel({ t, children }: { t: Translate; children: ReactNode }) {
  return (
    <section
      aria-labelledby="calculator-heading"
      className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900"
    >
      <h2 id="calculator-heading" className="text-lg font-semibold">
        {t('price.title')}
      </h2>
      {children}
    </section>
  );
}

function Breakdown({ quote, locale, t }: { quote: LeaseQuote; locale: Locale; t: Translate }) {
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const factor = quote.factor.toLocaleString(intlLocale[locale], { minimumFractionDigits: 6 });
  const rows: [string, string, boolean?][] = [
    [t('price.listPrice'), euro(quote.listPriceCents)],
    [t('price.downPayment'), `− ${euro(quote.downPaymentCents)}`],
    [t('price.financed'), euro(quote.financedCents), true],
    [
      t('price.band'),
      t('price.bandValue', {
        band: quote.band,
        interest: formatNumber(quote.annualInterestPercent, locale),
      }),
    ],
    [t('price.factor'), `× ${factor}`],
    [t('price.monthlyNet'), euro(quote.monthlyNetCents), true],
    [
      t('price.vat', { percent: formatNumber(quote.vatPercent, locale) }),
      euro(quote.monthlyVatCents),
    ],
    [t('price.monthlyGross'), euro(quote.monthlyGrossCents), true],
    [
      t('price.totalGross'),
      t('price.paymentsValue', {
        count: quote.termMonths,
        amount: euro(quote.monthlyGrossCents),
        total: euro(quote.totalGrossRentCents),
      }),
    ],
    [
      t('price.buyout', { percent: formatNumber(quote.buyoutPercent, locale) }),
      euro(quote.buyoutNetCents),
    ],
  ];

  return (
    <div>
      <h3 className="text-sm font-semibold">{t('price.breakdown')}</h3>
      <dl className="mt-2 divide-y divide-stone-100 text-sm dark:divide-stone-800">
        {rows.map(([label, value, strong]) => (
          <div key={label} className="flex justify-between gap-4 py-2">
            <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
            <dd className={`text-right tabular-nums ${strong ? 'font-semibold' : 'font-medium'}`}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-stone-600 dark:text-stone-400">{t('price.vatNote')}</p>
    </div>
  );
}
