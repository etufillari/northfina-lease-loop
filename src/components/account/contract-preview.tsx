'use client';

import { useEffect, useMemo, useState } from 'react';

import { getT } from '@/i18n/get-t';

type Props = {
  locale: Parameters<typeof getT>[0];
  applicationId: string;
};

type PreviewInvoice = {
  sequence: number;
  kind: string;
  period_start: string;
  period_end: string;
  invoice_date: string;
  due_date: string;
  net_cents: number;
  vat_rate_basis_points: number;
  vat_rate_percent: number;
  vat_cents: number;
  total_cents: number;
  status: string;
};

type ContractPreviewData = {
  application_id: string;
  customer_id: string;
  asset_id: string;
  quantity: number;

  quote_date: string;
  signed_on: string;
  start_on: string;
  planned_end_on: string;

  calculated_on: string;
  list_price_on_signing_cents: number | null;

  price_list_version: number | null;
  base_price_cents: number;
  down_payment_cents: number;
  financed_cents: number;
  term_months: number;
  band: string;
  factor_micros: number;
  annual_interest_basis_points: number;
  monthly_net_rent_cents: number;
  buyout_cents: number;

  can_sign: boolean;
  signatory_email: string | null;
  invoices: PreviewInvoice[];
};

type ApiError = {
  code?: string;
  message?: string;
};

function extractData<T>(payload: unknown): T {
  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    return (payload as { data: T }).data;
  }

  return payload as T;
}

function extractErrorCode(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) {
    return 'UNKNOWN_ERROR';
  }

  const body = payload as {
    code?: string;
    error?: string | ApiError;
  };

  if (typeof body.code === 'string') {
    return body.code;
  }

  if (typeof body.error === 'object' && body.error !== null) {
    return body.error.code ?? 'UNKNOWN_ERROR';
  }

  if (typeof body.error === 'string') {
    return body.error;
  }

  return 'UNKNOWN_ERROR';
}

function errorMessage(code: string, t: ReturnType<typeof getT>) {
  switch (code) {
    case 'ALREADY_SIGNED':
      return t('contract.alreadySigned');

    case 'NOT_APPROVED':
    case 'APPLICATION_NOT_APPROVED':
      return t('contract.notApproved');

    case 'ASSET_NOT_AVAILABLE':
      return t('contract.assetUnavailable');

    case 'SIGNATORY_REQUIRED':
      return t('contract.signatoryError');

    default:
      return t('contract.signError');
  }
}

function formatMoney(cents: number | null) {
  if (cents === null) {
    return '—';
  }

  return new Intl.NumberFormat('en-FI', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function formatPeriod(start: string, end: string) {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export default function ContractPreview({ locale, applicationId }: Props) {
  const t = useMemo(() => getT(locale), [locale]);

  const [preview, setPreview] = useState<ContractPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [confirmed, setConfirmed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchPreview() {
      setLoading(true);
      setLoadError(null);
      setPreview(null);
      setConfirmed(false);
      setSigned(false);
      setSignError(null);

      try {
        const response = await fetch(
          `/api/applications/${encodeURIComponent(applicationId)}/contract-preview`,
          {
            cache: 'no-store',
            signal: controller.signal,
          }
        );

        const payload: unknown = await response.json();

        if (!response.ok) {
          throw new Error(extractErrorCode(payload));
        }

        setPreview(extractData<ContractPreviewData>(payload));
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        setLoadError(error instanceof Error ? error.message : 'UNKNOWN_ERROR');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void fetchPreview();

    return () => controller.abort();
  }, [applicationId]);

  async function handleSign() {
    if (!confirmed || !preview?.can_sign || signing) {
      return;
    }

    setSigning(true);
    setSignError(null);

    try {
      const response = await fetch('/api/contracts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          application_id: applicationId,
        }),
      });

      const payload: unknown = await response.json();

      if (!response.ok) {
        throw new Error(extractErrorCode(payload));
      }

      setSigned(true);
    } catch (error) {
      setSignError(
        error instanceof Error ? errorMessage(error.message, t) : t('contract.signError')
      );
    } finally {
      setSigning(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <p className="text-muted-foreground">{t('contract.loading')}</p>
      </div>
    );
  }

  if (loadError || !preview) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="rounded-lg border p-6">
          <p className="font-medium">{t('contract.loadError')}</p>

          {loadError && (
            <p className="mt-2 text-sm text-muted-foreground">{errorMessage(loadError, t)}</p>
          )}
        </div>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-lg border p-8 text-center">
          <div className="mb-4 text-3xl" aria-hidden="true">
            ✓
          </div>

          <h1 className="text-2xl font-semibold">{t('contract.signed')}</h1>

          <p className="mt-2 text-muted-foreground">{t('contract.signedDescription')}</p>

          <a
            href={`/${locale}/account/applications`}
            className="mt-6 inline-flex rounded-md bg-primary px-5 py-2.5 text-primary-foreground"
          >
            {t('contract.back')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">{t('contract.title')}</h1>

        <p className="mt-2 text-muted-foreground">{t('contract.subtitle')}</p>
      </header>

      {/* Lease terms */}
      <section className="space-y-4 rounded-lg border p-6">
        <h2 className="text-lg font-semibold">{t('contract.terms')}</h2>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label={t('contract.asset')} value={preview.asset_id} />

          <Detail label={t('contract.quantity')} value={preview.quantity} />

          <Detail label={t('contract.quoteDate')} value={formatDate(preview.quote_date)} />

          <Detail label={t('contract.calculatedOn')} value={formatDate(preview.calculated_on)} />

          <Detail label={t('contract.startDate')} value={formatDate(preview.start_on)} />

          <Detail label={t('contract.endDate')} value={formatDate(preview.planned_end_on)} />

          <Detail
            label={t('contract.term')}
            value={`${preview.term_months} ${t('contract.months')}`}
          />
        </div>
      </section>

      {/* Financial summary */}
      <section className="space-y-4 rounded-lg border p-6">
        <h2 className="text-lg font-semibold">{t('contract.financials')}</h2>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label={t('contract.basePrice')} value={formatMoney(preview.base_price_cents)} />

          <Detail
            label={t('contract.listPrice')}
            value={formatMoney(preview.list_price_on_signing_cents)}
          />

          <Detail
            label={t('contract.downPayment')}
            value={formatMoney(preview.down_payment_cents)}
          />

          <Detail label={t('contract.financed')} value={formatMoney(preview.financed_cents)} />

          <Detail
            label={t('contract.monthlyRent')}
            value={formatMoney(preview.monthly_net_rent_cents)}
          />

          <Detail
            label={t('contract.interest')}
            value={`${(preview.annual_interest_basis_points / 100).toFixed(2)} %`}
          />

          <Detail label={t('contract.buyout')} value={formatMoney(preview.buyout_cents)} />

          <Detail label={t('contract.pricingBand')} value={preview.band} />

          <Detail
            label={t('contract.priceListVersion')}
            value={preview.price_list_version ?? '—'}
          />
        </div>
      </section>

      {/* Invoice schedule */}
      <section className="space-y-4 rounded-lg border p-6">
        <h2 className="text-lg font-semibold">{t('contract.invoices')}</h2>

        {preview.invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('contract.noInvoices')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-3 pr-4 font-medium">{t('contract.sequence')}</th>
                  <th className="py-3 pr-4 font-medium">{t('contract.kind')}</th>
                  <th className="py-3 pr-4 font-medium">{t('contract.period')}</th>
                  <th className="py-3 pr-4 font-medium">{t('contract.invoiceDate')}</th>
                  <th className="py-3 pr-4 font-medium">{t('contract.dueDate')}</th>
                  <th className="py-3 pr-4 font-medium text-right">{t('contract.net')}</th>
                  <th className="py-3 pr-4 font-medium text-right">{t('contract.vat')}</th>
                  <th className="py-3 font-medium text-right">{t('contract.total')}</th>
                </tr>
              </thead>

              <tbody>
                {preview.invoices.map((invoice) => (
                  <tr key={invoice.sequence} className="border-b last:border-0">
                    <td className="py-3 pr-4">{invoice.sequence}</td>

                    <td className="py-3 pr-4">{invoice.kind}</td>

                    <td className="py-3 pr-4 whitespace-nowrap">
                      {formatPeriod(invoice.period_start, invoice.period_end)}
                    </td>

                    <td className="py-3 pr-4 whitespace-nowrap">
                      {formatDate(invoice.invoice_date)}
                    </td>

                    <td className="py-3 pr-4 whitespace-nowrap">{formatDate(invoice.due_date)}</td>

                    <td className="py-3 pr-4 text-right whitespace-nowrap">
                      {formatMoney(invoice.net_cents)}
                    </td>

                    <td className="py-3 pr-4 text-right whitespace-nowrap">
                      {formatMoney(invoice.vat_cents)}
                    </td>

                    <td className="py-3 text-right font-medium whitespace-nowrap">
                      {formatMoney(invoice.total_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Signing */}
      <section className="space-y-5 rounded-xl border border-emerald-900/60 bg-emerald-950/10 p-6">
        {preview.can_sign ? (
          <>
            <p className="text-sm text-emerald-200/70">{t('contract.calculatedNote')}</p>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-4">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-1 size-4 accent-emerald-500"
              />

              <span className="text-sm text-stone-200">{t('contract.confirmation')}</span>
            </label>

            {signError && (
              <p role="alert" className="text-sm text-red-400">
                {signError}
              </p>
            )}

            <button
              type="button"
              onClick={handleSign}
              disabled={!confirmed || signing}
              className="rounded-lg bg-emerald-600 px-6 py-3 font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {signing ? t('contract.signing') : t('contract.sign')}
            </button>
          </>
        ) : (
          <div className="space-y-2">
            <p className="font-medium text-stone-100">{t('contract.signatoryRequired')}</p>

            {preview.signatory_email && (
              <p className="text-sm text-stone-400">
                {t('contract.signatoryEmail')}: {preview.signatory_email}
              </p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
