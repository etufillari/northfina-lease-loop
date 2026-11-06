'use client';

// Spine step 2: pick a term and a down payment (slider or typed, see price-inputs.tsx) and watch the monthly price update.
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
import { DownPaymentInput, TermInput } from './price-inputs';

type PriceCalculatorProps = {
  assetId: string;
  listPriceCents: number;
  /** VAT on today's date, looked up by the server. */
  vatPercent: number;
  table: CoefficientTable;
  /** Slider positions read from the URL by the server, already validated. */
  initial: PriceSelection;
  locale: Locale;
  /** Page content above the controls (details, list price), rendered by the server. */
  top: ReactNode;
  /** Page content below the controls (history, CO₂), rendered by the server. */
  bottom: ReactNode;
};

/** Writes the slider positions into the URL, keeping any other params (the catalogue filters). */
function rememberInUrl(selection: PriceSelection) {
  const params = new URLSearchParams(window.location.search);
  params.set('term', String(selection.termMonths));
  params.set('down', String(selection.downPaymentCents));
  window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
}

export function PriceCalculator(props: PriceCalculatorProps) {
  const { assetId, listPriceCents, vatPercent, table, initial, locale, top, bottom } = props;
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);

  const terms = leaseTerms(table);
  const range = downPaymentRange(listPriceCents, table);
  const [termMonths, setTermMonths] = useState(() =>
    terms.includes(initial.termMonths) ? initial.termMonths : (terms[0] ?? DEFAULT_TERM_MONTHS)
  );
  const [downPaymentCents, setDownPaymentCents] = useState(initial.downPaymentCents);

  function changeTerm(months: number) {
    setTermMonths(months);
    rememberInUrl({ termMonths: months, downPaymentCents });
  }

  function changeDownPayment(cents: number) {
    setDownPaymentCents(cents);
    rememberInUrl({ termMonths, downPaymentCents: cents });
  }

  if (!range.ok) {
    const lowest = Math.min(...table.bands.map((b) => b.min_financed_cents));
    return (
      <div className="mt-8 max-w-4xl space-y-6">
        {top}
        <Panel t={t}>
          <p className="mt-3 text-stone-700 dark:text-stone-300">
            {t('price.cannotLease', { min: euro(lowest) })}
          </p>
        </Panel>
        {bottom}
      </div>
    );
  }

  const result = quoteLease({ listPriceCents, downPaymentCents, termMonths, vatPercent }, table);
  const fixedDownPayment = range.minCents === range.maxCents;

  return (
    // One column on small screens (details, controls, breakdown, history); from lg up the
    // breakdown and the Apply button move into a sidebar that stays in view while scrolling.
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <div className="lg:col-start-1 lg:row-start-1">{top}</div>

      <Panel t={t} className="lg:col-start-1 lg:row-start-2">
        <div className="mt-4">
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

          <TermInput terms={terms} termMonths={termMonths} onChange={changeTerm} t={t} />
          <DownPaymentInput
            range={range}
            downPaymentCents={downPaymentCents}
            onChange={changeDownPayment}
            locale={locale}
            t={t}
          />
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
      </Panel>

      <aside
        aria-labelledby="breakdown-heading"
        className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm lg:sticky lg:top-6 lg:col-start-2 lg:row-span-3 lg:row-start-1 dark:border-stone-800 dark:bg-stone-900"
      >
        {result.ok ? (
          <>
            <Breakdown quote={result.quote} locale={locale} t={t} />
            <Link
              href={`/${locale}/apply?asset=${assetId}&term=${termMonths}&down=${downPaymentCents}`}
              className="mt-6 block rounded-lg bg-emerald-700 px-5 py-2.5 text-center font-semibold text-white shadow-sm hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-stone-900"
            >
              {t('price.apply')}
            </Link>
          </>
        ) : (
          <>
            <h2 id="breakdown-heading" className="text-lg font-semibold">
              {t('price.breakdown')}
            </h2>
            <p className="mt-3 text-stone-700 dark:text-stone-300">{t('price.cannotQuote')}</p>
          </>
        )}
      </aside>

      <div className="lg:col-start-1 lg:row-start-3">{bottom}</div>
    </div>
  );
}

function Panel({
  t,
  className = '',
  children,
}: {
  t: Translate;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby="calculator-heading"
      className={`rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900 ${className}`}
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
      <h2 id="breakdown-heading" className="text-lg font-semibold">
        {t('price.breakdown')}
      </h2>
      <dl className="mt-3 divide-y divide-stone-100 text-sm dark:divide-stone-800">
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
