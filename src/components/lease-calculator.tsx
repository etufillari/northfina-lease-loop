'use client';

// The live price: term and down-payment sliders, recalculated on every move in the browser
// with the same pure domain functions the server uses (D-018). "Get my quote" asks the server
// to price and store the quote (D-034); the quote page shows it and signs it.
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import type { CoefficientTable, VatRates } from '@/data/schemas';
import { formatEuro, parseEuros } from '@/domain/money';
import {
  bandEdgeHint,
  cheaperBandAbove,
  quoteLease,
  snapDownPayment,
  type DownPaymentBounds,
} from '@/domain/pricing';
import { QUOTE_VALID_DAYS } from '@/domain/pricing-rules';
import { vatRateOn, withVat } from '@/domain/vat';
import { formatFactor, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { refusalText } from '@/i18n/refusals';
import { PriceOverTerm, TermComparison } from './price-over-term';

type Bounds = Extract<DownPaymentBounds, { ok: true }>;

export type LeaseCalculatorProps = {
  locale: Locale;
  assetId: string;
  listPriceCents: number;
  priceListVersion: number;
  table: CoefficientTable;
  bounds: Bounds;
  vatRates: VatRates;
  /** Today (the demo's as-of date): a lease signed today starts today. */
  startDate: string;
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
  // Without a down-payment tip, still say why an item just under a band edge rents for more.
  const bandNote =
    hint === null && quote.ok ? cheaperBandAbove(table, quote.financedCents, termMonths) : null;

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
              {bounds.minCents === bounds.maxCents ? (
                <output htmlFor={downId} className="font-display text-xl font-bold tabular-nums">
                  {euro(downPaymentCents)}
                </output>
              ) : (
                <EuroField
                  label={t('lease.downPaymentTyped')}
                  cents={downPaymentCents}
                  onCommit={(cents) => setDownPaymentCents(snapDownPayment(bounds, cents))}
                />
              )}
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
              {bandNote ? (
                <p className="mt-3 border-l-2 border-accent pl-3 text-sm text-muted">
                  {t('lease.bandNote', {
                    edge: euro(bandNote.minFinancedCents),
                    band: bandNote.band,
                    rate: formatNumber(bandNote.annualInterestPercent, locale),
                    rent: euro(bandNote.monthlyNetRentCents),
                  })}
                </p>
              ) : null}
            </section>
          ) : null}

          <TermComparison
            locale={locale}
            table={table}
            vatRates={props.vatRates}
            startDate={props.startDate}
            listPriceCents={listPriceCents}
            downPaymentCents={downPaymentCents}
            terms={terms}
            selectedTerm={termMonths}
          />
        </div>

        {quote.ok ? (
          <MonthlyPanel
            {...props}
            netCents={quote.monthlyNetRentCents}
            termMonths={termMonths}
            downPaymentCents={downPaymentCents}
          />
        ) : null}
      </div>
    </>
  );
}

/** Stores the quote on the server and opens it, so it can be signed for the next 7 days. */
function QuoteButton(props: {
  locale: Locale;
  assetId: string;
  termMonths: number;
  downPaymentCents: number;
}) {
  const { locale } = props;
  const t = getT(locale);
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  // The code the server refused with picks the message (D-038).
  const [refusal, setRefusal] = useState<string | undefined>(undefined);

  async function save() {
    setState('busy');
    const response = await fetch('/api/quotes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        assetId: props.assetId,
        termMonths: props.termMonths,
        downPaymentCents: props.downPaymentCents,
      }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      success: boolean;
      data?: { id: number };
      error?: { code: string };
    } | null;
    if (body?.success && body.data) {
      router.push(`/${locale}/quotes/${body.data.id}`);
      return;
    }
    setRefusal(body?.error?.code);
    setState('error');
  }

  return (
    <div className="mt-6 border-t border-line pt-5">
      <button
        type="button"
        onClick={() => void save()}
        disabled={state === 'busy'}
        className="btn-primary w-full py-3.5"
      >
        {state === 'busy' ? t('quote.saving') : t('quote.save')}
      </button>
      <p className="mt-2 text-xs text-muted">{t('quote.saveNote', { days: QUOTE_VALID_DAYS })}</p>
      {state === 'error' ? (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {refusalText(t, refusal, 'quote.saveError')}
        </p>
      ) : null}
    </div>
  );
}

function MonthlyPanel(
  props: LeaseCalculatorProps & { netCents: number; termMonths: number; downPaymentCents: number }
) {
  const { locale } = props;
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  // The page only shows the calculator when today has a VAT rate.
  const vat = vatRateOn(props.vatRates, props.startDate);
  if (!vat.ok) return null;
  const vatRatePercent = vat.ratePercent;
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
      <PriceOverTerm
        locale={locale}
        vatRates={props.vatRates}
        startDate={props.startDate}
        termMonths={props.termMonths}
        monthlyNetRentCents={props.netCents}
        downPaymentCents={props.downPaymentCents}
        tone="plain"
      />
      <QuoteButton
        locale={locale}
        assetId={props.assetId}
        termMonths={props.termMonths}
        downPaymentCents={props.downPaymentCents}
      />
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

/**
 * The down payment as a typed amount, next to the slider (#34): a judge can type 20 000 instead of
 * dragging. Commits on Enter or leaving the field; anything that isn't an amount is undone.
 */
function EuroField(props: { label: string; cents: number; onCommit: (cents: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const cents = draft === null ? null : parseEuros(draft);
    if (cents !== null) props.onCommit(cents);
    setDraft(null);
  };
  return (
    <span className="flex items-baseline gap-1.5 rounded-md bg-bg px-2.5 py-1 ring-1 ring-line ring-inset focus-within:ring-2 focus-within:ring-accent">
      <input
        type="text"
        inputMode="decimal"
        aria-label={props.label}
        value={draft ?? plainEuros(props.cents)}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') setDraft(null);
        }}
        className="w-32 bg-transparent text-right font-display text-xl font-bold tabular-nums outline-none focus-visible:outline-none"
      />
      <span aria-hidden="true" className="font-display text-xl font-bold text-muted">
        €
      </span>
    </span>
  );
}

/**
 * Cents as an amount the field can parse back (parseEuros drops spaces): 2000000 → "20 000",
 * 12345 → "123.45". Grouped with no-break spaces in every language, so no comma is ambiguous.
 */
function plainEuros(cents: number): string {
  const euros = String(Math.trunc(cents / 100)).replace(/\B(?=(\d{3})+$)/g, '\u00a0');
  const rest = cents % 100;
  return rest === 0 ? euros : `${euros}.${String(rest).padStart(2, '0')}`;
}

/** How far along its range the slider is, for the filled part of the track. Presentation only. */
function fillPercent(value: number, bounds: Bounds): number {
  const span = bounds.maxCents - bounds.minCents;
  return span === 0 ? 100 : ((value - bounds.minCents) / span) * 100;
}
