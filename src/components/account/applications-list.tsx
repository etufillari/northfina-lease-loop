'use client';

import { useEffect, useMemo, useState } from 'react';

import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { ApplicationStatusBadge } from '../ui/application-status-badge';

type ApplicationsListProps = {
  locale: Locale;
};

type ApplicationListItem = {
  id: string;
  asset_id: string;
  quantity: number;
  quote_date: string;
  start_on: string;
  term_months: number;
  down_payment_cents: number;
  financed_cents: number;
  decision: 'approved' | 'rejected' | 'manual_review';
  eligible_from: string | null;
  contract_id: string | null;
};

type ApiResponse = {
  success: boolean;
  data?: ApplicationListItem[];
  error?: {
    message?: string;
  };
};

export default function ApplicationsList({ locale }: ApplicationsListProps) {
  const t = useMemo(() => getT(locale), [locale]);

  const [applications, setApplications] = useState<ApplicationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchApplications() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/applications', {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });

        const result = (await response.json()) as ApiResponse;

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error?.message ?? t('account.applications.error'));
        }

        setApplications(result.data);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;

        setError(err instanceof Error ? err.message : t('account.applications.error'));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void fetchApplications();

    return () => controller.abort();
  }, [t]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-stone-800 bg-stone-900 p-8 text-center text-sm text-stone-400">
        {t('account.applications.loading')}
      </div>
    );
  }

  if (error) {
    return <ErrorState title={t('account.applications.errorTitle')} description={error} />;
  }

  if (applications.length === 0) {
    return (
      <EmptyState
        title={t('account.applications.emptyTitle')}
        description={t('account.applications.emptyDescription')}
      />
    );
  }

  return (
    <div className="space-y-4">
      {applications.map((application) => (
        <article
          key={application.id}
          className="rounded-2xl border border-stone-800 bg-stone-900 p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-stone-500">{t('account.applications.applicationId')}</p>

              <p className="mt-1 break-all font-mono text-sm text-stone-300">{application.id}</p>
            </div>

            <ApplicationStatusBadge status={application.decision} t={t} />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-stone-500">{t('account.applications.term')}</p>
              <p className="mt-1 text-sm font-medium text-stone-200">
                {application.term_months} {t('account.applications.months')}
              </p>
            </div>

            <div>
              <p className="text-xs text-stone-500">{t('account.applications.quantity')}</p>
              <p className="mt-1 text-sm font-medium text-stone-200">{application.quantity}</p>
            </div>

            <div>
              <p className="text-xs text-stone-500">{t('account.applications.financedAmount')}</p>
              <p className="mt-1 text-sm font-medium text-stone-200">
                {formatEuro(application.financed_cents, locale)}
              </p>
            </div>
          </div>

          {application.decision === 'approved' && application.contract_id && (
            <div className="mt-5 rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-emerald-300">
                  {t('account.applications.contractAvailable')}
                </p>

                <button
                  type="button"
                  onClick={() => {
                    // TODO: Navigate to the contract page.
                  }}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-stone-950 transition hover:bg-emerald-400"
                >
                  {t('account.applications.continueToContract')}
                </button>
              </div>
            </div>
          )}

          {application.decision === 'manual_review' && (
            <p className="mt-4 text-sm text-amber-300">
              {t('account.applications.manualReviewDescription')}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
