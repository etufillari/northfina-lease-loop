'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { formatEuro } from '@/domain/money';
import { invoiceAmounts, dueDateForMonth } from '@/domain/lease-billing';
import { checkoutQuote } from '@/domain/checkout-quote';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { PriceChange } from '@/domain/price-lock';
import type { CheckoutData } from '@/server/checkout-options';
import { setCart, useCart } from './cart-store';
import { PriceChangeNotice } from './price-change-notice';
import { ProductPhoto } from './product-photo';

export function CartPage({
  locale,
  data,
  applicationId,
  priceChanges = [],
  quotedOn = '',
}: {
  locale: Locale;
  data: CheckoutData;
  applicationId?: string;
  /** Card 2: prices that changed since the approved quote, and the formatted quote date. */
  priceChanges?: readonly PriceChange[];
  quotedOn?: string;
}) {
  const t = getT(locale);
  const router = useRouter();
  const selections = useCart();
  const items = selections.map((selection) => {
    const option = data.options.find((value) => value.id === selection.id);
    if (!option) return undefined;
    const quote = checkoutQuote(
      option.priceCents,
      selection.downPaymentCents,
      selection.termMonths,
      data.today,
      data.table,
      data.rates
    );
    return quote ? { ...option, ...selection, ...quote } : undefined;
  });
  const [step, setStep] = useState<'cart' | 'checkout'>(applicationId ? 'checkout' : 'cart');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'error' | 'login' | 'changed' | null>(null);
  const money = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const rate = data.rates.find(
    (rate) =>
      rate.valid_from <= data.today && (rate.valid_to === null || rate.valid_to >= data.today)
  );
  const vatBasisPoints = rate ? Math.round(rate.rate_percent * 100) : 0;
  const gross = (cents: number) => invoiceAmounts(cents, vatBasisPoints).totalCents;
  const buyoutGross = (cents: number, months: number) => {
    const end = dueDateForMonth(data.today, months);
    const rate = data.rates.find(
      (rate) => rate.valid_from <= end && (rate.valid_to === null || rate.valid_to >= end)
    );
    return rate
      ? money(invoiceAmounts(cents, Math.round(rate.rate_percent * 100)).totalCents)
      : t('asset.noPrice');
  };
  const valid = items.every((item) => item?.available);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !valid || items.length === 0) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const tokenKey = 'lease-loop-checkout-token';
      const token = sessionStorage.getItem(tokenKey) ?? crypto.randomUUID();
      sessionStorage.setItem(tokenKey, token);
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          applicationId,
          date: data.today,
          items: items.map((item) => ({
            id: item!.id,
            priceCents: item!.priceCents,
            monthlyTotalCents: item!.monthlyTotalCents,
            version: item!.priceListVersion,
            termMonths: item!.termMonths,
            downPaymentCents: item!.downPaymentCents,
          })),
          delivery: form.get('delivery'),
          address: form.get('address'),
          payment: form.get('payment'),
          ...(form.get('acceptPriceChange') === 'on' ? { acceptPriceChange: true } : {}),
        }),
      });
      if (!response.ok) {
        // A price or approval changed on the server: reload so the notice shows the latest.
        if (response.status === 409) router.refresh();
        setError(
          response.status === 401
            ? 'login'
            : [403, 409].includes(response.status)
              ? 'changed'
              : 'error'
        );
        return;
      }
      sessionStorage.removeItem(tokenKey);
      setCart([]);
      router.push(`/${locale}/account/leases`);
      router.refresh();
    } catch {
      setError('error');
    } finally {
      setBusy(false);
    }
  }
  const monthlyTotal = items.reduce((sum, item) => sum + (item?.monthlyTotalCents ?? 0), 0);
  const downTotal = items.reduce((sum, item) => sum + gross(item?.downPaymentCents ?? 0), 0);
  const buttonClass =
    'pressable flex min-h-target w-full items-center justify-center gap-2 rounded-pill bg-primary px-6 py-3 font-semibold text-white hover:bg-primary-focus disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 tablet:py-12">
      <Link
        href={`/${locale}`}
        className="inline-flex min-h-target items-center gap-2 text-caption text-ink-muted hover:text-primary"
      >
        <span aria-hidden="true">←</span> {t('cart.browse')}
      </Link>
      <header className="mt-5 flex flex-wrap items-end justify-between gap-6 border-b border-hairline pb-8">
        <h1 className="font-display text-display-sm font-semibold tablet:text-display-lg">
          {t(step === 'cart' ? 'cart.title' : 'cart.checkoutTitle')}
        </h1>
        {selections.length ? (
          <ol
            className="flex items-center gap-3 text-caption sm:gap-5"
            aria-label={t('application.start')}
          >
            <li
              className="flex items-center gap-2"
              aria-current={step === 'cart' ? 'step' : undefined}
            >
              <span
                className="flex size-7 items-center justify-center rounded-full bg-ink text-fine font-semibold text-white"
                aria-hidden="true"
              >
                1
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => setStep('cart')}
                className="min-h-target font-semibold hover:text-primary"
              >
                {t('cart.nav')}
              </button>
            </li>
            <li aria-hidden="true" className="h-px w-5 bg-hairline sm:w-10" />
            <li
              className="flex items-center gap-2"
              aria-current={step === 'checkout' ? 'step' : undefined}
            >
              <span
                className={`flex size-7 items-center justify-center rounded-full text-fine font-semibold ${step === 'checkout' ? 'bg-ink text-white' : 'bg-parchment text-ink-muted'}`}
                aria-hidden="true"
              >
                2
              </span>
              <span className={step === 'checkout' ? 'font-semibold' : 'text-ink-muted'}>
                {t('cart.checkoutTitle')}
              </span>
            </li>
          </ol>
        ) : null}
      </header>

      {!selections.length ? (
        <div className="mx-auto flex max-w-lg flex-col items-center py-20 text-center">
          <span className="flex size-20 items-center justify-center rounded-full bg-parchment text-ink-muted">
            <CartIcon className="size-8" />
          </span>
          <p className="mt-6 text-tagline font-semibold">{t('cart.empty')}</p>
          <Link href={`/${locale}`} className={`${buttonClass} mt-8 w-auto`}>
            {t('cart.browse')} <span aria-hidden="true">→</span>
          </Link>
        </div>
      ) : (
        <div className="mt-10 grid items-start gap-10 desktop:grid-cols-[minmax(0,1fr)_360px] desktop:gap-16">
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-tagline font-semibold">
                {t('cart.itemsTitle')}{' '}
                <span className="ml-1 text-body font-normal text-ink-muted">
                  ({selections.length})
                </span>
              </h2>
              {step === 'checkout' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setStep('cart')}
                  className="min-h-target text-caption text-primary hover:underline"
                >
                  {t('cart.editCart')}
                </button>
              ) : null}
            </div>
            <ul className="mt-3 divide-y divide-hairline">
              {selections.map(({ id }, index) => {
                const item = items[index];
                return (
                  <li key={id} className="flex gap-4 py-6 sm:gap-6">
                    <Link
                      href={`/${locale}/products/${encodeURIComponent(id)}`}
                      className="w-24 shrink-0 self-start rounded-lg sm:w-36"
                      aria-label={item?.name ?? t('cart.missing')}
                    >
                      <ProductPhoto
                        assetId={id}
                        productName={item?.name ?? id}
                        locale={locale}
                        showCaption={false}
                        sizes="144px"
                      />
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex flex-wrap justify-between gap-x-5 gap-y-2">
                        <h3 className="max-w-sm text-body font-semibold">
                          <Link
                            href={`/${locale}/products/${encodeURIComponent(id)}`}
                            className="hover:text-primary"
                          >
                            {item?.name ?? t('cart.missing')}
                          </Link>
                        </h3>
                        {item ? (
                          <p className="shrink-0 text-body font-semibold tabular-nums">
                            {money(item.monthlyTotalCents)}{' '}
                            <span className="text-caption font-normal text-ink-muted">
                              {t('cart.perMonth')}
                            </span>
                          </p>
                        ) : null}
                      </div>
                      {item ? (
                        <>
                          <p className="mt-3 text-caption text-ink-muted">
                            {t('product.months', { count: item.termMonths })}
                          </p>
                          <p className="mt-1 text-caption text-ink-muted">
                            {t('pricing.downGross')}: {money(gross(item.downPaymentCents))}
                          </p>
                          {!item.available ? (
                            <p className="mt-3 text-caption font-semibold">
                              {t('cart.unavailable')}
                            </p>
                          ) : null}
                        </>
                      ) : null}
                      {step === 'cart' ? (
                        <button
                          type="button"
                          onClick={() => {
                            sessionStorage.removeItem('lease-loop-checkout-token');
                            setCart(selections.filter((value) => value.id !== id));
                          }}
                          className="mt-3 inline-flex min-h-target items-center gap-1.5 self-start text-caption text-ink-muted hover:text-primary hover:underline"
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            className="size-4"
                          >
                            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" />
                          </svg>
                          {t('cart.remove')}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>

            {step === 'checkout' ? (
              <form
                id="checkout-form"
                onSubmit={submit}
                className="mt-8 border-t border-hairline pt-8"
                aria-busy={busy}
              >
                <fieldset disabled={busy} className="space-y-8">
                  <fieldset>
                    <legend className="text-tagline font-semibold">
                      {t('cart.deliveryTitle')}
                    </legend>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {(['delivery', 'pickup'] as const).map((method) => (
                        <label
                          key={method}
                          className="flex min-h-20 cursor-pointer items-center gap-3 rounded-lg border border-hairline p-4 has-checked:border-primary has-checked:bg-primary/5"
                        >
                          <input
                            type="radio"
                            name="delivery"
                            value={method}
                            defaultChecked={method === 'delivery'}
                            className="size-4 accent-primary"
                          />
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            className="size-6 shrink-0 text-ink-muted"
                          >
                            {method === 'delivery' ? (
                              <>
                                <path d="M3 6h11v11H3zM14 10h4l3 4v3h-7" />
                                <circle cx="7" cy="18" r="2" />
                                <circle cx="18" cy="18" r="2" />
                              </>
                            ) : (
                              <>
                                <path d="M4 10v10h16V10M3 10l2-6h14l2 6M8 20v-6h8v6M3 10h18" />
                              </>
                            )}
                          </svg>
                          <span className="text-caption font-semibold">{t(`cart.${method}`)}</span>
                        </label>
                      ))}
                    </div>
                    <label className="mt-5 block text-caption font-semibold" htmlFor="address">
                      {t('cart.location')}
                    </label>
                    <input
                      id="address"
                      name="address"
                      minLength={3}
                      maxLength={200}
                      required
                      autoComplete="street-address"
                      className="mt-2 min-h-target w-full rounded-sm border border-hairline bg-canvas px-4 py-3 text-body"
                      aria-describedby="location-note"
                    />
                    <p id="location-note" className="mt-2 text-caption text-ink-muted">
                      {t('cart.locationNote')}
                    </p>
                  </fieldset>
                  <fieldset className="border-t border-hairline pt-8">
                    <legend className="float-left mb-5 w-full text-tagline font-semibold">
                      {t('cart.paymentTitle')}
                    </legend>
                    <div className="clear-both grid gap-3 sm:grid-cols-2">
                      {(['card', 'invoice'] as const).map((method) => (
                        <label
                          key={method}
                          className="flex min-h-20 cursor-pointer items-center gap-3 rounded-lg border border-hairline p-4 has-checked:border-primary has-checked:bg-primary/5"
                        >
                          <input
                            type="radio"
                            name="payment"
                            value={method}
                            defaultChecked={method === 'card'}
                            className="size-4 accent-primary"
                          />
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            className="size-6 shrink-0 text-ink-muted"
                          >
                            {method === 'card' ? (
                              <>
                                <rect x="3" y="5" width="18" height="14" rx="2" />
                                <path d="M3 10h18M6 15h4" />
                              </>
                            ) : (
                              <>
                                <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6" />
                              </>
                            )}
                          </svg>
                          <span className="text-caption font-semibold">{t(`cart.${method}`)}</span>
                        </label>
                      ))}
                    </div>
                    <p className="mt-3 text-caption text-ink-muted">{t('cart.paymentNote')}</p>
                  </fieldset>
                  {priceChanges.length ? (
                    <PriceChangeNotice locale={locale} changes={priceChanges} quotedOn={quotedOn} />
                  ) : null}
                  {error ? (
                    <div
                      role="alert"
                      className="rounded-sm border border-hairline bg-parchment p-4 text-caption"
                    >
                      {t(`cart.${error}`)}
                      {error === 'login' ? (
                        <>
                          {' '}
                          <Link
                            href={`/${locale}/login?next=cart`}
                            className="inline-flex min-h-target items-center font-semibold text-primary underline"
                          >
                            {t('cart.signIn')}
                          </Link>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </fieldset>
              </form>
            ) : null}
          </div>

          <aside
            className="h-fit rounded-lg bg-parchment p-6 tablet:p-8"
            aria-labelledby="cart-summary"
          >
            <h2 id="cart-summary" className="text-tagline font-semibold">
              {t('cart.summary')}
            </h2>
            <p className="mt-7 text-caption text-ink-muted">{t('pricing.monthlyGross')}</p>
            <p className="mt-2 font-display text-display-lg font-semibold tabular-nums">
              {money(monthlyTotal)}
              <span className="ml-1 text-caption font-normal text-ink-muted">
                {t('cart.perMonth')}
              </span>
            </p>
            <p className="mt-2 text-caption text-ink-muted">{t('cart.monthlyInfo')}</p>
            <dl className="mt-6 border-y border-hairline py-5">
              <div className="flex flex-wrap justify-between gap-3 text-caption">
                <dt>{t('pricing.downGross')}</dt>
                <dd className="font-semibold tabular-nums">{money(downTotal)}</dd>
              </div>
            </dl>
            <details className="border-b border-hairline py-4">
              <summary className="cursor-pointer text-caption font-semibold text-ink">
                {t('cart.breakdown')}
              </summary>
              <div className="mt-4 space-y-5">
                {items
                  .filter((item) => item !== undefined)
                  .map((item) => (
                    <div key={item.id} className="text-caption">
                      <p className="font-semibold">{item.name}</p>
                      <dl className="mt-2 space-y-2 text-ink-muted">
                        <div>
                          <dt>{t('cart.totalEstimate')}</dt>
                          <dd className="font-semibold tabular-nums text-ink">
                            {money(item.totalCents)}
                          </dd>
                        </div>
                        <div>
                          <dt>{t('dashboard.buyoutGross')}</dt>
                          <dd className="font-semibold tabular-nums text-ink">
                            {buyoutGross(item.buyoutCents, item.termMonths)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ))}
              </div>
            </details>
            {step === 'cart' ? (
              <button
                type="button"
                disabled={!valid}
                onClick={() => router.push(`/${locale}/application`)}
                className={`${buttonClass} mt-6`}
              >
                {t('application.start')} <span aria-hidden="true">→</span>
              </button>
            ) : (
              <button
                type="submit"
                form="checkout-form"
                disabled={!valid || busy}
                className={`${buttonClass} mt-6`}
              >
                {t(busy ? 'cart.working' : 'cart.confirm')}
              </button>
            )}
            <p className="mt-5 text-caption text-ink-muted">{t('cart.simulation')}</p>
          </aside>
        </div>
      )}
    </div>
  );
}

function CartIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 3h2l2.5 12h10.7l2-8H6" />
      <circle cx="9" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
    </svg>
  );
}
