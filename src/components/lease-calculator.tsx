'use client';

// The live price: term and down-payment sliders, recalculated on every move in the browser
// with the same pure domain functions the server uses to sign (D-018). The application form
// below it signs; the API prices again and never trusts the numbers shown here.
import { useId, useMemo, useState } from 'react';
import type { AssetCategory, CoefficientTable, Question, VatRates } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import { bandEdgeHint, quoteLease, type DownPaymentBounds } from '@/domain/pricing';
import { withVat } from '@/domain/vat';
import { formatFactor, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { ApplicationForm, type Persona } from './application-form';

type Bounds = Extract<DownPaymentBounds, { ok: true }>;

export type LeaseCalculatorProps = {
  locale: Locale;
  assetId: string;
  listPriceCents: number;
  priceListVersion: number;
  table: CoefficientTable;
  bounds: Bounds;
  vatRatePercent: number;
  category: AssetCategory;
  questions: Question[];
  personas: Persona[];
  vatRates: VatRates;
  today: string;
};

export function LeaseCalculator(props: LeaseCalculatorProps) {
  const { locale, table, bounds, listPriceCents } = props;
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const terms = useMemo(
    () =>
      Object.keys(table.end_of_term_buyout_percent_of_financed)
        .map(Number)
        .sort((a, b) => a - b),
    [table]
  );

  const [termMonths, setTermMonths] = useState(terms.includes(36) ? 36 : (terms[0] ?? 12));
  const [downPaymentCents, setDownPaymentCents] = useState(bounds.minCents);
  const input = { listPriceCents, termMonths, downPaymentCents };
  const quote = quoteLease(table, input);
  const hint = bandEdgeHint(table, input);

  const downId = useId();

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-[1fr_24rem] lg:gap-12">
        <div className="space-y-8">
          <fieldset>
            <legend className="eyebrow">{t('lease.term')}</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {terms.map((months) => (
                <label
                  key={months}
                  className="cursor-pointer rounded-full px-4 py-2 text-sm font-semibold tabular-nums ring-1 ring-line transition-colors ring-inset hover:ring-fg has-checked:bg-accent has-checked:text-on-accent has-checked:ring-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-accent"
                >
                  <input
                    type="radio"
                    name="term"
                    value={months}
                    checked={termMonths === months}
                    onChange={() => setTermMonths(months)}
                    className="sr-only"
                  />
                  {t('lease.months', { count: months })}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <div className="flex items-baseline justify-between gap-4">
              <label htmlFor={downId} className="eyebrow">
                {t('lease.downPayment')}
              </label>
              <output htmlFor={downId} className="font-display text-xl font-bold tabular-nums">
                {euro(downPaymentCents)}
              </output>
            </div>
            {bounds.minCents === bounds.maxCents ? (
              <p className="mt-2 text-sm text-muted">
                {t('lease.downPaymentFixed', { amount: euro(bounds.minCents) })}
              </p>
            ) : (
              <>
                <input
                  id={downId}
                  type="range"
                  min={bounds.minCents}
                  max={bounds.maxCents}
                  step={bounds.stepCents}
                  value={downPaymentCents}
                  onChange={(event) => setDownPaymentCents(Number(event.target.value))}
                  aria-valuetext={euro(downPaymentCents)}
                  className="range mt-2"
                  style={
                    { '--fill': `${fillPercent(downPaymentCents, bounds)}%` } as React.CSSProperties
                  }
                />
                <p className="mt-1 text-sm text-muted">
                  {t('lease.downPaymentRange', {
                    min: euro(bounds.minCents),
                    max: euro(bounds.maxCents),
                  })}
                </p>
              </>
            )}
            {hint ? (
              <p className="mt-3 rounded-md bg-warn-bg p-3 text-sm text-warn-fg ring-1 ring-warn-line ring-inset">
                {t('lease.bandHint', {
                  down: euro(hint.downPaymentCents),
                  saving: euro(hint.savingPerMonthCents),
                })}
              </p>
            ) : null}
          </div>

          {quote.ok ? (
            <section aria-labelledby="breakdown">
              <h2
                id="breakdown"
                className="font-display text-base font-bold tracking-tight uppercase"
              >
                {t('lease.breakdown')}
              </h2>
              <dl className="mt-3 divide-y divide-line text-sm">
                <Row label={t('lease.listPrice', { version: props.priceListVersion })}>
                  {euro(listPriceCents)}
                </Row>
                <Row label={t('lease.minusDown')}>− {euro(downPaymentCents)}</Row>
                <Row label={t('lease.financed')} strong>
                  {euro(quote.financedCents)}
                </Row>
                <Row label={t('lease.factor', { band: quote.band })}>
                  {formatFactor(quote.factor, locale)}
                </Row>
                <Row label={t('lease.net')} strong>
                  {euro(quote.monthlyNetRentCents)}
                </Row>
                <Row label={t('lease.buyout')}>{euro(quote.buyoutCents)}</Row>
                <Row label={t('lease.totalCost')} strong>
                  {euro(quote.totalNetCostCents)}
                </Row>
              </dl>
              <p className="mt-2 text-xs text-muted">{t('lease.totalCostNote')}</p>
            </section>
          ) : null}
        </div>

        {quote.ok ? <MonthlyPanel {...props} netCents={quote.monthlyNetRentCents} /> : null}
      </div>
      {quote.ok ? (
        <ApplicationForm
          locale={locale}
          questions={props.questions}
          personas={props.personas}
          vatRates={props.vatRates}
          today={props.today}
          assetId={props.assetId}
          deal={{ category: props.category, financedAmountCents: quote.financedCents, termMonths }}
          downPaymentCents={downPaymentCents}
          monthlyNetRentCents={quote.monthlyNetRentCents}
        />
      ) : null}
    </>
  );
}

function MonthlyPanel(props: LeaseCalculatorProps & { netCents: number }) {
  const { locale, vatRatePercent } = props;
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const monthly = withVat(props.netCents, vatRatePercent);

  return (
    <aside className="panel h-fit p-6 shadow-xl shadow-black/5 lg:sticky lg:top-24">
      <h2 className="eyebrow">{t('lease.monthly')}</h2>
      <p
        className="mt-2 font-display text-4xl font-extrabold tracking-tight text-accent-text tabular-nums"
        aria-live="polite"
      >
        {euro(monthly.grossCents)}
      </p>
      <dl className="mt-4 space-y-1 text-sm">
        <Row label={t('lease.net')}>{euro(monthly.netCents)}</Row>
        <Row label={t('lease.vat', { rate: formatNumber(vatRatePercent, locale) })}>
          {euro(monthly.vatCents)}
        </Row>
      </dl>
      <p className="mt-3 text-xs text-muted">{t('lease.vatNote')}</p>
    </aside>
  );
}

function Row({
  label,
  strong = false,
  children,
}: {
  label: string;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-semibold' : ''}`}>{children}</dd>
    </div>
  );
}

/** How far along its range the slider is, for the filled part of the track. Presentation only. */
function fillPercent(value: number, bounds: Bounds): number {
  const span = bounds.maxCents - bounds.minCents;
  return span === 0 ? 100 : ((value - bounds.minCents) / span) * 100;
}
