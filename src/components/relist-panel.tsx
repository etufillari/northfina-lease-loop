'use client';

import { useRef } from 'react';
import { relistExampleTermMonths, type RelistOffer } from '@/domain/relist-offer';
import { invoiceAmounts } from '@/domain/lease-billing';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { primaryButtonClass } from './form-classes';
import type { WorkLine } from './work-plan';

/** The decision to put an item back on the market. Nothing is published until it is confirmed. */
export function RelistPanel({
  locale,
  itemName,
  offer,
  work,
  vatBasisPoints,
  busy,
  priceChanged,
  onPublish,
  onRetire,
}: {
  locale: Locale;
  itemName: string;
  offer: RelistOffer;
  work: readonly WorkLine[];
  vatBasisPoints: number;
  busy: boolean;
  priceChanged: boolean;
  onPublish: (expectedPriceCents: number) => void;
  onRetire: () => void;
}) {
  const t = getT(locale);
  const dialog = useRef<HTMLDialogElement>(null);
  const currency = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const gross = (net: number) => invoiceAmounts(net, vatBasisPoints).totalCents;
  const price = currency(gross(offer.priceNetCents));
  const dropped = offer.priceChangeSinceQuoteCents < 0;
  const loss = offer.netResultCents < 0;
  return (
    <div className="mt-6">
      {priceChanged ? (
        <p role="alert" className="mb-4 rounded-sm bg-canvas p-4 text-caption font-semibold">
          {t('relist.priceChanged')}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => dialog.current?.showModal()}
        className={`${primaryButtonClass} w-full`}
      >
        {t('relist.button')}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onRetire}
        className="mt-2 min-h-target w-full text-caption text-primary underline"
      >
        {t('recovery.retire')}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="relist-title"
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg bg-canvas p-6 text-ink backdrop:bg-ink/40"
      >
        <h2 id="relist-title" className="text-tagline font-semibold">
          {t('relist.title')}
        </h2>
        <p className="mt-2 text-caption text-ink-muted">{itemName}</p>
        <p className="mt-5 text-caption text-ink-muted">{t('relist.newPrice')}</p>
        <p className="mt-1 font-display text-display-lg font-semibold">{price}</p>
        <p className="mt-1 text-caption text-ink-muted">
          {t('relist.netPrice', { price: currency(offer.priceNetCents) })}
        </p>
        <p className="mt-3 text-caption tabular-nums">
          {currency(gross(offer.originalPriceCents))} ×{' '}
          {t('relist.formula', {
            age: Math.round(offer.factors.agePercent * 10) / 10,
            condition: Math.round(offer.factors.conditionPercent * 10) / 10,
            usage: Math.round(offer.factors.usagePercent * 10) / 10,
          })}
        </p>
        <dl className="mt-5 divide-y divide-divider text-caption">
          {offer.monthlyTotalCents !== null ? (
            <Row
              label={t('relist.monthly', { months: relistExampleTermMonths })}
              value={currency(offer.monthlyTotalCents)}
            />
          ) : null}
          <Row label={t('relist.original')} value={currency(gross(offer.originalPriceCents))} />
          <Row label={t('relist.age')} value={String(offer.ageMonths)} />
          <Row label={t('relist.workCost')} value={currency(gross(offer.refurbishmentCostCents))} />
          {offer.customerRepairCents > 0 ? (
            <Row
              label={t('relist.customerRepairs')}
              value={`−${currency(gross(offer.customerRepairCents))}`}
            />
          ) : null}
          <Row
            label={t('relist.netResult')}
            value={`${offer.netResultCents < 0 ? '−' : ''}${currency(gross(Math.abs(offer.netResultCents)))}`}
          />
        </dl>
        <details className="mt-3">
          <summary className="flex min-h-target cursor-pointer items-center text-caption font-semibold text-primary">
            {t('relist.workDetails')}
          </summary>
          <ul className="divide-y divide-divider text-caption">
            {work.map((line) => (
              <li key={line.key} className="flex justify-between gap-4 py-2">
                <span>
                  {line.title}
                  {line.customerPays ? (
                    <span className="block text-ink-muted">{t('recovery.customerLine')}</span>
                  ) : null}
                </span>
                <span className="shrink-0">{line.cents ? currency(gross(line.cents)) : '—'}</span>
              </li>
            ))}
          </ul>
        </details>
        {dropped ? (
          <p className="mt-4 text-caption">
            {t('relist.droppedSinceQuote', {
              amount: currency(gross(-offer.priceChangeSinceQuoteCents)),
            })}
          </p>
        ) : null}
        {loss ? <p className="mt-4 text-caption font-semibold">● {t('relist.loss')}</p> : null}
        {!offer.leasable ? (
          <p role="alert" className="mt-4 text-caption font-semibold">
            ● {t('relist.notLeasable')}
          </p>
        ) : null}
        <p className="mt-4 text-caption text-ink-muted">{t('relist.effect')}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy || !offer.leasable}
            onClick={() => {
              dialog.current?.close();
              onPublish(offer.priceNetCents);
            }}
            className={`${primaryButtonClass} flex-1 whitespace-nowrap`}
          >
            {t('relist.confirm', { price })}
          </button>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="pressable min-h-target flex-1 rounded-pill border border-primary px-6 py-3 text-caption text-primary"
          >
            {t('relist.cancel')}
          </button>
        </div>
      </dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="shrink-0 font-semibold">{value}</dd>
    </div>
  );
}
