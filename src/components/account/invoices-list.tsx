'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type InvoiceListItem = {
  id: string;
  contract_id: string;
  sequence: number;
  kind: 'rent' | 'down_payment' | 'buyout';
  invoice_date: string;
  due_date: string;
  total_cents: number;
  status: 'issued' | 'paid' | 'cancelled';
};

type ApiResponse = {
  success: boolean;
  data?: InvoiceListItem[];
  error?: {
    message?: string;
  };
};

type InvoicesListProps = {
  locale: Locale;
};

export default function InvoicesList({ locale }: InvoicesListProps) {
  const t = useMemo(() => getT(locale), [locale]);

  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    [locale]
  );

  const formatDate = useCallback(
    (value: string) => {
      const date = new Date(`${value}T00:00:00`);
      return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
    },
    [dateFormatter]
  );

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
            <h2 className="font-medium text-stone-100">
              {t('account.invoices.number', {
                number: invoice.sequence,
              })}
            </h2>

            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-stone-400">
              <span>
                {t('account.invoices.invoiceDate')}: {formatDate(invoice.invoice_date)}
              </span>
              <span>
                {t('account.invoices.dueDate')}: {formatDate(invoice.due_date)}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end">
            <span className="font-semibold tabular-nums text-stone-100">
              {formatEuro(invoice.total_cents, locale)}
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
