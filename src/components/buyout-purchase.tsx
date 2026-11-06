'use client';
// Buying the item: the price up front, a button, and a confirmation dialog with the invoice
// spelled out (net, VAT, total, when it is sent and due) before anything is committed.
// During the term, confirming records "buy at the end"; once the term is over, it buys.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { BuyoutInvoicePreview } from '@/domain/buyout';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export function BuyoutPurchase({
  locale,
  contractId,
  personaId,
  suffix,
  invoice,
  pricesInclVat,
  purchaseAtEnd,
  termOver,
}: {
  locale: Locale;
  contractId: string;
  personaId: string;
  suffix: string;
  /** Null when no VAT rate is known for the invoice date. */
  invoice: BuyoutInvoicePreview | null;
  /** Consumers see the price with VAT, businesses net. */
  pricesInclVat: boolean;
  /** The customer already chose to buy at the end of the term. */
  purchaseAtEnd: boolean;
  termOver: boolean;
}) {
  const t = getT(locale);
  const router = useRouter();
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/contracts/${contractId}/${path}${suffix}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, actor: personaId }),
      });
      const body = await response.json();
      if (body.success) {
        setOpen(false);
        router.refresh();
      } else {
        setError(body.error?.message ?? t('common.error'));
      }
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  if (!invoice) return null;

  const confirm = () =>
    termOver ? post('end-of-term', { action: 'buy' }) : post('buyout-option', { optIn: true });
  const shownPrice = pricesInclVat ? invoice.totalCents : invoice.netCents;
  const vatLabel = pricesInclVat
    ? t('price.inclVat', { rate: invoice.vatRatePercent })
    : t('price.exclVat');

  return (
    <div className="flex flex-wrap items-center gap-3">
      {purchaseAtEnd && !termOver ? (
        <>
          <p className="text-sm text-emerald-900 dark:text-emerald-200">
            ✓{' '}
            {t('buyout.optedIn', {
              amount: `${euro(shownPrice)} ${vatLabel}`,
              date: formatIsoDate(invoice.invoiceDate, locale),
            })}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => post('buyout-option', { optIn: false })}
            className="text-sm font-medium text-emerald-800 underline hover:no-underline disabled:opacity-50 dark:text-emerald-300"
          >
            {t('buyout.undo')}
          </button>
        </>
      ) : (
        <>
          <div>
            <p className="text-xs text-stone-600 dark:text-stone-400">{t('buyout.priceLabel')}</p>
            <p className="text-lg font-semibold tabular-nums">
              {euro(shownPrice)}{' '}
              <span className="text-sm font-normal text-stone-600 dark:text-stone-400">
                {vatLabel}
              </span>
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
            className="rounded-xl bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {termOver ? t('buyout.buyNow') : t('buyout.buyAtEnd')}
          </button>
        </>
      )}

      {error && !open ? (
        <p role="alert" className="w-full text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="buyout-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-stone-900"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="buyout-title" className="text-lg font-semibold">
              {t('buyout.confirmTitle')}
            </h3>
            <dl className="mt-4 space-y-1.5 text-sm tabular-nums">
              <Row label={t('buyout.net')} value={euro(invoice.netCents)} />
              <Row
                label={t('buyout.vat', { rate: invoice.vatRatePercent })}
                value={`+ ${euro(invoice.vatCents)}`}
              />
              <Row label={t('buyout.total')} value={euro(invoice.totalCents)} bold />
            </dl>
            <p className="mt-4 text-sm">
              {t('buyout.invoiceNote', {
                date: formatIsoDate(invoice.invoiceDate, locale),
                due: formatIsoDate(invoice.dueDate, locale),
              })}
            </p>
            {!termOver ? (
              <p className="mt-2 text-xs text-stone-600 dark:text-stone-400">
                {t('buyout.vatNote')}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-2 font-medium ring-1 ring-stone-300 ring-inset hover:bg-stone-50 disabled:opacity-50 dark:ring-stone-700 dark:hover:bg-stone-800"
              >
                {t('buyout.cancel')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={confirm}
                className="rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {busy ? t('common.loading') : t('buyout.confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${bold ? 'font-semibold' : ''}`}>
      <dt className="text-stone-600 dark:text-stone-300">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
