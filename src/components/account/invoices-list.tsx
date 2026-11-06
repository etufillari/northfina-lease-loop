'use client';

import { useEffect, useMemo, useState } from 'react';

import { formatEuro } from '@/domain/money';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { InvoiceView } from '@/server/invoicing/invoices';

type ApiResponse = {
  success: boolean;
  data?: InvoiceView[];
  error?: {
    message?: string;
  };
};

type InvoicesListProps = {
  locale: Locale;
};

export default function InvoicesList({ locale }: InvoicesListProps) {
  const t = useMemo(() => getT(locale), [locale]);

  const [invoices, setInvoices] = useState<InvoiceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatMoney = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const formatDate = (isoDate: string) => formatIsoDate(isoDate, locale, 'medium');
  const formatChange = (cents: number) => `${cents > 0 ? '+' : ''}${formatMoney(cents)}`;

  useEffect(() => {
    const controller = new AbortController();

    async function loadInvoices() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/invoices', {
          cache: 'no-store',
          signal: controller.signal,
        });

        const result = (await response.json()) as ApiResponse;

        if (!response.ok || !result.success) {
          throw new Error(result.error?.message ?? t('account.invoices.loadError'));
        }

        setInvoices(result.data ?? []);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;

        setError(err instanceof Error ? err.message : t('account.invoices.loadError'));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadInvoices();

    return () => controller.abort();
  }, [t]);

  if (loading) {
    return <p className="text-sm text-stone-400">{t('account.invoices.loading')}</p>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-5">
        <p className="text-sm text-red-300">{error}</p>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="rounded-xl border border-stone-800 bg-stone-900/40 p-8 text-center">
        <p className="text-sm text-stone-400">{t('account.invoices.empty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {invoices.map((invoice) => (
        <article
          key={invoice.id}
          className="flex flex-col gap-4 rounded-xl border border-stone-800 bg-stone-900/40 p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 className="font-medium text-stone-100">
                {t('account.invoices.number', {
                  number: invoice.sequence,
                })}
              </h2>
              <span className="text-sm text-stone-400">
                {t(`contract.invoiceKind.${invoice.kind}`)}
              </span>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-stone-400">
              <span>
                {t('account.invoices.invoiceDate')}: {formatDate(invoice.invoice_date)}
              </span>
              <span>
                {t('account.invoices.dueDate')}: {formatDate(invoice.due_date)}
              </span>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-stone-400">
              <span>
                {t('contract.net')}: {formatMoney(invoice.net_cents)}
              </span>
              <span>
                {t('contract.vat')} ({formatNumber(invoice.vat_rate_percent, locale)} %):{' '}
                {formatMoney(invoice.vat_cents)}
              </span>
            </div>

            {invoice.vat_change && (
              <p className="text-sm text-amber-300">
                {t('contract.vatChangeNote', {
                  change: formatChange(invoice.vat_change.total_change_cents),
                  from: formatNumber(invoice.vat_change.from_percent, locale),
                  to: formatNumber(invoice.vat_change.to_percent, locale),
                })}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end">
            <span className="font-semibold tabular-nums text-stone-100">
              {formatMoney(invoice.total_cents)}
            </span>

            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                invoice.status === 'paid'
                  ? 'bg-emerald-950/60 text-emerald-300'
                  : invoice.status === 'cancelled'
                    ? 'bg-stone-800 text-stone-400'
                    : 'bg-amber-950/40 text-amber-300'
              }`}
            >
              {t(`account.invoices.status.${invoice.status}`)}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}
