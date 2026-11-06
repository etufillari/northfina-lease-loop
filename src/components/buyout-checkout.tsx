'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  buyoutBreakdown,
  type SettlementInput,
  type settlementQuote,
} from '@/domain/lease-settlement';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { ProductPhoto } from './product-photo';

type Props = {
  locale: Locale;
  contractId: string;
  name: string;
  assetId: string;
  quote: ReturnType<typeof settlementQuote>;
  finance: SettlementInput;
  quoteDate: string;
  active: boolean;
  paid: boolean;
  paidTotalCents?: number;
};
export function BuyoutCheckout({
  locale,
  contractId,
  name,
  assetId,
  quote,
  finance,
  quoteDate,
  active,
  paid,
  paidTotalCents,
}: Props) {
  const t = getT(locale);
  const router = useRouter();
  const [step, setStep] = useState<'quote' | 'payment' | 'done'>(paid ? 'done' : 'quote');
  const [method, setMethod] = useState('card');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const token = useRef<string | null>(null);
  const [amount, setAmount] = useState(paidTotalCents ?? quote.buyoutTotalCents);
  const money = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const parts = buyoutBreakdown(finance);
  async function pay() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      token.current ??= crypto.randomUUID();
      const response = await fetch(`/api/leases/${encodeURIComponent(contractId)}/buyout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token.current,
          quoteDate,
          expectedTotalCents: quote.buyoutTotalCents,
          paymentMethod: method,
        }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      setAmount(quote.buyoutTotalCents);
      setStep('done');
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto mt-4 max-w-4xl">
      <h2 className="text-display-sm font-semibold">
        {t(step === 'done' ? 'flow.buyoutDone' : 'flow.buyoutTitle')}
      </h2>
      <p className="mt-3 max-w-2xl text-body text-ink-muted">
        {t(step === 'done' ? 'flow.buyoutDoneNote' : 'flow.buyoutIntro')}
      </p>
      <div className="mt-8 grid items-start gap-8 tablet:grid-cols-[minmax(0,1fr)_300px]">
        <section className="rounded-lg border border-hairline p-6">
          <div className="flex items-center gap-4">
            <div className="w-24 shrink-0">
              <ProductPhoto
                assetId={assetId}
                productName={name}
                locale={locale}
                sizes="96px"
                showCaption={false}
              />
            </div>
            <h3 className="text-tagline font-semibold">{name}</h3>
          </div>
          {step === 'quote' ? (
            <>
              <h3 className="mt-8 font-semibold">{t('flow.calculation')}</h3>
              <p className="mt-2 text-caption text-ink-muted">{t('flow.buyoutRule')}</p>
              <dl className="mt-4 divide-y divide-divider text-caption tabular-nums">
                {parts.remainingPayments > 0 ? (
                  <Row
                    label={t('flow.buyoutPayments', {
                      count: parts.remainingPayments,
                      amount: money(parts.monthlyCents),
                    })}
                    value={money(parts.allPaymentsCents)}
                  />
                ) : null}
                <Row label={t('flow.discountedResidual')} value={money(parts.endPriceCents)} />
                {parts.interestSavedCents > 0 ? (
                  <Row
                    label={t('flow.buyoutSaved', { rate: parts.annualRatePercent })}
                    value={`−${money(parts.interestSavedCents)}`}
                  />
                ) : null}
                {parts.unpaidCents > 0 ? (
                  <Row label={t('flow.unpaidRent')} value={money(parts.unpaidCents)} />
                ) : null}
                <Row label={t('flow.buyoutTotal')} value={money(parts.totalCents)} />
              </dl>
              <p className="mt-4 text-caption text-ink-muted">{t('flow.endPriceNote')}</p>
            </>
          ) : null}
          {step === 'payment' ? (
            <fieldset disabled={busy} className="mt-8">
              <legend className="font-semibold">{t('cart.paymentMethod')}</legend>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(['card', 'invoice'] as const).map((value) => (
                  <label
                    key={value}
                    className="flex min-h-target cursor-pointer items-center gap-3 rounded-lg border border-hairline p-4 has-checked:border-primary has-checked:bg-primary/5"
                  >
                    <input
                      type="radio"
                      name="method"
                      value={value}
                      checked={method === value}
                      onChange={() => setMethod(value)}
                      className="accent-primary"
                    />
                    {t(`cart.${value}`)}
                  </label>
                ))}
              </div>
              <p className="mt-4 text-caption text-ink-muted">{t('cart.paymentNote')}</p>
            </fieldset>
          ) : null}
          {step === 'done' ? (
            <Link
              href={`/${locale}/account/leases/${contractId}`}
              className="mt-6 inline-flex min-h-target items-center text-primary"
            >
              {t('dashboard.viewLease')} →
            </Link>
          ) : null}
        </section>
        <aside className="rounded-lg bg-parchment p-6">
          <p className="text-caption text-ink-muted">
            {t(step === 'done' ? 'flow.amountPaid' : 'flow.buyoutTotal')}
          </p>
          <p className="mt-3 text-display-lg font-semibold">
            {money(step === 'done' ? amount : quote.buyoutTotalCents)}
          </p>
          <p className="mt-2 text-caption text-ink-muted">{t('pricing.includesVat')}</p>
          {step === 'quote' && active ? (
            <button
              type="button"
              onClick={() => setStep('payment')}
              className="mt-6 min-h-target w-full rounded-pill bg-primary px-5 py-3 font-semibold text-white"
            >
              {t('flow.toPayment')} →
            </button>
          ) : null}
          {step === 'payment' ? (
            <>
              <button
                type="button"
                disabled={busy || !active}
                onClick={() => void pay()}
                className="mt-6 min-h-target w-full rounded-pill bg-primary px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {t(busy ? 'auth.working' : 'flow.confirmPayment')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setStep('quote')}
                className="mt-2 min-h-target w-full text-caption text-primary"
              >
                {t('flow.back')}
              </button>
            </>
          ) : null}
          <p className="mt-5 text-caption text-ink-muted">{t('flow.paymentSimulation')}</p>
          {error ? (
            <p role="alert" className="mt-4 text-caption">
              {t('flow.buyoutError')}
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="shrink-0 font-semibold">{value}</dd>
    </div>
  );
}
