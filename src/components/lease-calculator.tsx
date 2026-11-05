'use client';

// The live price: term and down-payment sliders, recalculated on every move in the browser
// with the same pure domain functions the server uses to sign (D-018). Signing posts the
// choices to the API, which prices them again and never trusts the numbers shown here.
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import type { CoefficientTable } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import { bandEdgeHint, quoteLease, type DownPaymentBounds } from '@/domain/pricing';
import { withVat } from '@/domain/vat';
import { formatFactor, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

type Bounds = Extract<DownPaymentBounds, { ok: true }>;

export type LeaseCalculatorProps = {
  locale: Locale;
  assetId: string;
  listPriceCents: number;
  priceListVersion: number;
  table: CoefficientTable;
  bounds: Bounds;
  vatRatePercent: number;
  customers: { id: string; name: string }[];
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
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-8">
        <fieldset>
          <legend className="text-sm font-medium">{t('lease.term')}</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {terms.map((months) => (
              <label
                key={months}
                className="cursor-pointer rounded-full px-4 py-2 text-sm font-medium ring-1 ring-stone-300 ring-inset has-checked:bg-emerald-700 has-checked:text-white has-checked:ring-emerald-700 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-emerald-700 dark:ring-stone-700"
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
            <label htmlFor={downId} className="text-sm font-medium">
              {t('lease.downPayment')}
            </label>
            <output htmlFor={downId} className="text-lg font-semibold tabular-nums">
              {euro(downPaymentCents)}
            </output>
          </div>
          {bounds.minCents === bounds.maxCents ? (
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
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
                className="mt-3 w-full accent-emerald-700"
              />
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                {t('lease.downPaymentRange', {
                  min: euro(bounds.minCents),
                  max: euro(bounds.maxCents),
                })}
              </p>
            </>
          )}
          {hint ? (
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200 ring-inset dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800">
              {t('lease.bandHint', {
                down: euro(hint.downPaymentCents),
                saving: euro(hint.savingPerMonthCents),
              })}
            </p>
          ) : null}
        </div>

        {quote.ok ? (
          <section aria-labelledby="breakdown">
            <h2 id="breakdown" className="text-lg font-semibold">
              {t('lease.breakdown')}
            </h2>
            <dl className="mt-3 divide-y divide-stone-200 text-sm dark:divide-stone-800">
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
            <p className="mt-2 text-xs text-stone-600 dark:text-stone-400">
              {t('lease.totalCostNote')}
            </p>
          </section>
        ) : null}
      </div>

      {quote.ok ? (
        <MonthlyPanel
          {...props}
          termMonths={termMonths}
          downPaymentCents={downPaymentCents}
          netCents={quote.monthlyNetRentCents}
        />
      ) : null}
    </div>
  );
}

function MonthlyPanel(
  props: LeaseCalculatorProps & { termMonths: number; downPaymentCents: number; netCents: number }
) {
  const { locale, vatRatePercent } = props;
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const monthly = withVat(props.netCents, vatRatePercent);
  const router = useRouter();
  const [customerId, setCustomerId] = useState('');
  const [state, setState] = useState<'idle' | 'signing' | 'error' | 'taken'>('idle');
  const customerFieldId = useId();

  async function sign() {
    setState('signing');
    const response = await fetch('/api/contracts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        assetId: props.assetId,
        customerId,
        termMonths: props.termMonths,
        downPaymentCents: props.downPaymentCents,
      }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as
      { success: true; data: { id: number } } | { success: false; error: { code: string } } | null;
    if (body?.success) {
      router.push(`/${locale}/contracts/${body.data.id}`);
      return;
    }
    setState(body?.error.code === 'ASSET_NOT_AVAILABLE' ? 'taken' : 'error');
  }

  return (
    <aside className="h-fit rounded-2xl border border-stone-200 bg-white p-6 shadow-sm lg:sticky lg:top-6 dark:border-stone-800 dark:bg-stone-900">
      <h2 className="text-sm font-medium text-stone-600 dark:text-stone-400">
        {t('lease.monthly')}
      </h2>
      <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums" aria-live="polite">
        {euro(monthly.grossCents)}
      </p>
      <dl className="mt-4 space-y-1 text-sm">
        <Row label={t('lease.net')}>{euro(monthly.netCents)}</Row>
        <Row label={t('lease.vat', { rate: formatNumber(vatRatePercent, locale) })}>
          {euro(monthly.vatCents)}
        </Row>
      </dl>
      <p className="mt-3 text-xs text-stone-600 dark:text-stone-400">{t('lease.vatNote')}</p>

      <div className="mt-6 border-t border-stone-200 pt-5 dark:border-stone-800">
        <label htmlFor={customerFieldId} className="text-sm font-medium">
          {t('lease.customer')}
        </label>
        <select
          id={customerFieldId}
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
          className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
        >
          <option value="">{t('lease.chooseCustomer')}</option>
          {props.customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void sign()}
          disabled={customerId === '' || state === 'signing'}
          className="mt-4 w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === 'signing' ? t('lease.signing') : t('lease.sign')}
        </button>
        <p className="mt-2 text-xs text-stone-600 dark:text-stone-400">{t('lease.signNote')}</p>
        {state === 'error' || state === 'taken' ? (
          <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
            {t(state === 'taken' ? 'lease.errorTaken' : 'lease.error')}
          </p>
        ) : null}
      </div>
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
      <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-semibold' : ''}`}>{children}</dd>
    </div>
  );
}
