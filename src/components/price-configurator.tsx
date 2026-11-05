'use client';
// Spine step 2: term and down-payment sliders with the monthly price updating live, the
// full breakdown (Smart Problem 6), and the consumer affordability hint — a suggestion,
// never a hard pre-consent rejection (docs/DECISIONS.md).
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import type { MessageKey } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

type LiveQuote = {
  priceListVersion: number;
  listPriceCents: number;
  maxDownPaymentCents: number;
  termsMonths: number[];
  quote: {
    downPaymentCents: number;
    financedCents: number;
    band: string;
    factorPpm: number;
    monthlyNetRentCents: number;
    netTotalCents: number;
    buyoutNetCents: number;
    termMonths: number;
  };
  vatRatePercent: number;
  monthlyRentWithVatCents: number;
  totalWithVatAtCurrentRateCents: number;
  affordability: { status: string; limitCents?: number } | null;
  suggestion: { termMonths: number; downPaymentCents: number } | null;
};

export function PriceConfigurator({
  locale,
  assetId,
  personaId,
  asOf,
}: {
  locale: Locale;
  assetId: string;
  personaId: string | null;
  asOf: string | null;
}) {
  const t = getT(locale);
  const router = useRouter();
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const [termMonths, setTermMonths] = useState(36);
  const [downCents, setDownCents] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [live, setLive] = useState<LiveQuote | null>(null);
  const [failReason, setFailReason] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      assetId,
      downPaymentCents: String(downCents),
      termMonths: String(termMonths),
      quantity: String(quantity),
    });
    if (personaId) params.set('customerId', personaId);
    if (asOf) params.set('asOf', asOf);
    return params.toString();
  }, [assetId, downCents, termMonths, quantity, personaId, asOf]);

  useEffect(() => {
    const handle = setTimeout(() => {
      fetch(`/api/quote?${query}`)
        .then((r) => r.json())
        .then((body) => {
          if (body.success) {
            setLive(body.data);
            setFailReason(null);
          } else {
            setLive(null);
            setFailReason(String(body.error?.message ?? 'generic'));
          }
        })
        .catch(() => setFailReason('generic'));
    }, 150);
    return () => clearTimeout(handle);
  }, [query]);

  async function apply() {
    if (!personaId || starting) return;
    setStarting(true);
    const response = await fetch(`/api/applications${asOf ? `?asOf=${asOf}` : ''}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        assetId,
        downPaymentCents: downCents,
        termMonths,
        quantity,
        customerId: personaId,
        actor: personaId,
      }),
    });
    const body = await response.json();
    setStarting(false);
    if (body.success) {
      router.push(`/${locale}/apply/${body.data.application.id}${asOf ? `?asOf=${asOf}` : ''}`);
    } else {
      window.alert(body.error?.message ?? t('common.error'));
    }
  }

  const terms = live?.termsMonths ?? [12, 24, 36, 48];
  const maxDown = live?.maxDownPaymentCents ?? 0;
  const knownReasons = ['below_minimum', 'above_maximum', 'down_payment_over_max'];
  const notPriceableKey = (
    failReason && knownReasons.includes(failReason)
      ? `price.notPriceable.${failReason}`
      : 'price.notPriceable.generic'
  ) as MessageKey;

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-5">
      <section className="rounded-2xl border border-stone-200 bg-white p-5 lg:col-span-3 dark:border-stone-800 dark:bg-stone-900">
        <h2 className="text-lg font-semibold">{t('asset.configure')}</h2>

        <div className="mt-4">
          <label htmlFor="quantity" className="flex items-center gap-2 text-sm font-medium">
            {t('price.quantity')}
            <input
              id="quantity"
              type="number"
              min={1}
              max={20}
              value={quantity}
              onChange={(event) =>
                setQuantity(Math.max(1, Math.min(20, Math.round(Number(event.target.value) || 1))))
              }
              className="w-16 rounded-lg border border-stone-300 px-2 py-1 text-right dark:border-stone-700 dark:bg-stone-900"
            />
            {quantity > 1 ? (
              <span className="font-normal text-stone-600 dark:text-stone-400">
                {t('price.quantityNote')}
              </span>
            ) : null}
          </label>
        </div>

        <div className="mt-4">
          <label htmlFor="term" className="text-sm font-medium">
            {t('price.term')}: <strong>{t('price.months', { months: termMonths })}</strong>
          </label>
          {/* The Spine asks for sliders, plural: the term is one too, snapping to the four
              terms the coefficient table prices. */}
          <input
            id="term"
            type="range"
            min={0}
            max={terms.length - 1}
            step={1}
            value={Math.max(0, terms.indexOf(termMonths))}
            onChange={(event) => setTermMonths(terms[Number(event.target.value)] ?? termMonths)}
            aria-valuetext={t('price.months', { months: termMonths })}
            className="mt-2 w-full accent-emerald-700"
          />
          <div className="mt-1 flex justify-between">
            {terms.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => setTermMonths(term)}
                aria-pressed={termMonths === term}
                className={`rounded px-1.5 py-0.5 text-xs tabular-nums ${
                  termMonths === term
                    ? 'font-semibold text-emerald-800 dark:text-emerald-300'
                    : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                }`}
              >
                {t('price.months', { months: term })}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <label htmlFor="down" className="text-sm font-medium">
            {t('price.downPayment')}: <strong>{euro(downCents)}</strong>
          </label>
          <input
            id="down"
            type="range"
            min={0}
            max={maxDown}
            step={1000}
            value={Math.min(downCents, maxDown)}
            onChange={(event) => setDownCents(Number(event.target.value))}
            className="mt-2 w-full accent-emerald-700"
          />
          <div className="mt-1 flex items-center justify-between gap-3 text-xs text-stone-600 dark:text-stone-400">
            <span>{t('price.downPaymentMax', { max: euro(maxDown) })}</span>
            <input
              type="number"
              min={0}
              max={Math.floor(maxDown / 100)}
              value={Math.round(downCents / 100)}
              onChange={(event) =>
                setDownCents(Math.max(0, Math.round(Number(event.target.value || 0) * 100)))
              }
              aria-label={t('price.downPayment')}
              className="w-28 rounded-lg border border-stone-300 px-2 py-1 text-right text-sm dark:border-stone-700 dark:bg-stone-900"
            />
          </div>
        </div>

        {live ? (
          <dl className="mt-6 space-y-1.5 border-t border-stone-100 pt-4 text-sm dark:border-stone-800">
            <h3 className="mb-2 text-sm font-semibold">{t('price.breakdown')}</h3>
            <Row label={t('price.listPrice')} value={euro(live.listPriceCents)} />
            <Row label={t('price.downPayment')} value={`− ${euro(live.quote.downPaymentCents)}`} />
            <Row
              label={`${t('price.financed')} (${t('price.band', { band: live.quote.band })})`}
              value={euro(live.quote.financedCents)}
            />
            <Row
              label={t('price.factor')}
              value={`× ${(live.quote.factorPpm / 1_000_000).toFixed(6)}`}
            />
            <Row label={t('price.netRent')} value={euro(live.quote.monthlyNetRentCents)} bold />
            <Row
              label={`${t('price.vat')} ${live.vatRatePercent} %`}
              value={`+ ${euro(live.monthlyRentWithVatCents - live.quote.monthlyNetRentCents)}`}
            />
            <Row label={t('price.buyout')} value={euro(live.quote.buyoutNetCents)} />
            <Row label={t('price.totalCost')} value={euro(live.totalWithVatAtCurrentRateCents)} />
          </dl>
        ) : (
          <p className="mt-6 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200 ring-inset dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800">
            {failReason ? t(notPriceableKey) : t('common.loading')}
          </p>
        )}
      </section>

      <section className="flex flex-col rounded-2xl border border-stone-200 bg-white p-5 lg:col-span-2 dark:border-stone-800 dark:bg-stone-900">
        <h2 className="text-sm font-medium text-stone-600 dark:text-stone-400">
          {t('price.monthly')}
        </h2>
        {live ? (
          <>
            <p className="mt-1 text-4xl font-semibold tabular-nums">
              {euro(live.monthlyRentWithVatCents)}
              <span className="ml-1 text-base font-normal text-stone-600 dark:text-stone-400">
                {t('common.perMonth')}
              </span>
            </p>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              {euro(live.quote.monthlyNetRentCents)} {t('price.exclVat')} ·{' '}
              {t('price.inclVat', { rate: live.vatRatePercent })}
            </p>

            {live.affordability?.status === 'failed' ? (
              <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200 ring-inset dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800">
                <p>
                  {t('affordability.failed', {
                    rent: euro(live.monthlyRentWithVatCents),
                    limit: euro(live.affordability.limitCents ?? 0),
                  })}
                </p>
                {live.suggestion ? (
                  <button
                    type="button"
                    className="mt-2 font-medium underline"
                    onClick={() => {
                      setTermMonths(live.suggestion!.termMonths);
                      setDownCents(live.suggestion!.downPaymentCents);
                    }}
                  >
                    {t('affordability.suggestion', {
                      term: live.suggestion.termMonths,
                      down: euro(live.suggestion.downPaymentCents),
                    })}
                  </button>
                ) : null}
              </div>
            ) : null}
            {live.affordability?.status === 'passed' ? (
              <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200 ring-inset dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800">
                {t('affordability.passed')}
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-2 text-stone-500">…</p>
        )}

        <div className="mt-auto pt-6">
          {personaId ? (
            <button
              type="button"
              onClick={apply}
              disabled={!live || starting}
              className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {t('asset.apply')}
            </button>
          ) : (
            <p className="text-sm text-stone-600 dark:text-stone-400">{t('asset.choosePersona')}</p>
          )}
        </div>
      </section>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${bold ? 'font-semibold' : ''}`}>
      <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
