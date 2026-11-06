'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';

type ContractsListProps = {
  locale: Locale;
};

type ContractListItem = {
  id: string;
  application_id: string;
  customer_id: string;
  asset_id: string;
  asset_name: string;
  signed_on: string;
  start_on: string;
  planned_end_on: string;
  actual_end_on: string | null;
  passed_to: string | null;
  passed_to_name: string | null;
  status: 'active' | 'bought_out' | 'returned' | 'passed_on' | 'exited_early';
  term_months: number;
  monthly_net_rent_cents: number;
  buyout_cents: number;
  total_cents: number;
  end_choice: 'not_due' | 'open' | 'expired' | 'closed';
  choice_deadline: string;
};

type PassOnCandidate = {
  id: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    message?: string;
  };
};

type EndOutcome = 'bought_out' | 'returned' | 'passed_on';

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`));
}

function candidateLabel(candidate: PassOnCandidate) {
  const name =
    candidate.name ?? [candidate.first_name, candidate.last_name].filter(Boolean).join(' ');

  return name || candidate.email || candidate.id;
}

export default function ContractsList({ locale }: ContractsListProps) {
  const t = useMemo(() => getT(locale), [locale]);

  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyContractId, setBusyContractId] = useState<string | null>(null);

  const [passOnContractId, setPassOnContractId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<PassOnCandidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');

  const fetchContracts = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch('/api/contracts', {
        method: 'GET',
        cache: 'no-store',
        signal,
      });

      const result = (await response.json()) as ApiResponse<ContractListItem[]>;

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error?.message ?? t('account.contracts.error'));
      }

      setContracts(result.data);
    },
    [t]
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadContracts() {
      try {
        setLoading(true);
        setError(null);
        await fetchContracts(controller.signal);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;

        setError(err instanceof Error ? err.message : t('account.contracts.error'));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadContracts();

    return () => controller.abort();
  }, [fetchContracts, t]);

  async function loadPassOnCandidates(contractId: string) {
    try {
      setBusyContractId(contractId);
      setActionError(null);
      setPassOnContractId(null);
      setCandidates([]);
      setSelectedCandidateId('');

      const response = await fetch(`/api/contracts/${contractId}/pass-on-candidates`, {
        cache: 'no-store',
      });

      const result = (await response.json()) as ApiResponse<PassOnCandidate[]>;

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error?.message ?? t('account.contracts.actionError'));
      }

      setCandidates(result.data);
      setPassOnContractId(contractId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('account.contracts.actionError'));
    } finally {
      setBusyContractId(null);
    }
  }

  async function endContract(contractId: string, outcome: EndOutcome, passedTo?: string) {
    const confirmationKey =
      outcome === 'bought_out'
        ? 'confirmBuyout'
        : outcome === 'returned'
          ? 'confirmReturn'
          : 'confirmPassOn';

    if (!window.confirm(t(`account.contracts.${confirmationKey}`))) return;

    try {
      setBusyContractId(contractId);
      setActionError(null);

      const response = await fetch(`/api/contracts/${contractId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome,
          ...(passedTo ? { passed_to: passedTo } : {}),
        }),
      });

      const result = (await response.json()) as ApiResponse<unknown>;

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message ?? t('account.contracts.actionError'));
      }

      setPassOnContractId(null);
      setCandidates([]);
      setSelectedCandidateId('');

      await fetchContracts();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('account.contracts.actionError'));
    } finally {
      setBusyContractId(null);
    }
  }

  const activeContracts = contracts.filter(
    (contract) => contract.status === 'active' && contract.end_choice === 'not_due'
  );

  const decisionContracts = contracts.filter(
    (contract) =>
      contract.status === 'active' &&
      (contract.end_choice === 'open' || contract.end_choice === 'expired')
  );

  const completedContracts = contracts.filter((contract) => contract.status !== 'active');

  if (loading) {
    return (
      <div className="rounded-2xl border border-stone-800 bg-stone-900 p-8 text-center text-sm text-stone-400">
        {t('account.contracts.loading')}
      </div>
    );
  }

  if (error) {
    return <ErrorState title={t('account.contracts.errorTitle')} description={error} />;
  }

  if (contracts.length === 0) {
    return (
      <EmptyState
        title={t('account.contracts.emptyTitle')}
        description={t('account.contracts.emptyDescription')}
      />
    );
  }

  function renderContract(contract: ContractListItem) {
    const isBusy = busyContractId === contract.id;
    const isPassOnOpen = passOnContractId === contract.id;

    return (
      <article
        key={contract.id}
        className="rounded-2xl border border-stone-800 bg-stone-900 p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-stone-500">{t('account.contracts.contractId')}</p>
            <p className="mt-1 break-all font-mono text-sm text-stone-300">{contract.id}</p>
          </div>

          <span className="rounded-full border border-stone-700 bg-stone-800 px-3 py-1 text-xs font-medium text-stone-300">
            {t(`account.contracts.status.${contract.status}`)}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-stone-500">{t('contract.asset')}</p>
            <p className="mt-1 break-all text-sm font-medium text-stone-200">
              {contract.asset_name}
            </p>
          </div>

          <div>
            <p className="text-xs text-stone-500">{t('account.contracts.startDate')}</p>
            <p className="mt-1 text-sm font-medium text-stone-200">
              {formatDate(contract.start_on, locale)}
            </p>
          </div>

          <div>
            <p className="text-xs text-stone-500">{t('account.contracts.plannedEndDate')}</p>
            <p className="mt-1 text-sm font-medium text-stone-200">
              {formatDate(contract.planned_end_on, locale)}
            </p>
          </div>

          <div>
            <p className="text-xs text-stone-500">{t('account.contracts.monthlyRent')}</p>
            <p className="mt-1 text-sm font-medium text-stone-200">
              {formatEuro(contract.monthly_net_rent_cents, intlLocale[locale])}
            </p>
          </div>

          <div>
            <p className="text-xs text-stone-500">{t('account.contracts.term')}</p>
            <p className="mt-1 text-sm font-medium text-stone-200">
              {contract.term_months} {t('account.contracts.months')}
            </p>
          </div>

          <div>
            <p className="text-xs text-stone-500">{t('contract.totalCost')}</p>
            <p className="mt-1 text-sm font-medium text-stone-200">
              {formatEuro(contract.total_cents, intlLocale[locale])}
            </p>
          </div>
        </div>

        {contract.status === 'active' && contract.end_choice === 'open' && (
          <div className="mt-5 rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4">
            <p className="text-sm font-medium text-emerald-300">
              {t('account.contracts.decisionRequired')}
            </p>
            <p className="mt-1 text-xs text-stone-400">
              {t('account.contracts.choiceDeadline')}:{' '}
              {formatDate(contract.choice_deadline, locale)}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void endContract(contract.id, 'bought_out')}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-stone-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('account.contracts.buyOut')}
              </button>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => void endContract(contract.id, 'returned')}
                className="rounded-lg border border-stone-700 px-4 py-2 text-sm font-medium text-stone-200 transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('account.contracts.return')}
              </button>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => void loadPassOnCandidates(contract.id)}
                className="rounded-lg border border-stone-700 px-4 py-2 text-sm font-medium text-stone-200 transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBusy ? t('account.contracts.loadingCandidates') : t('account.contracts.passOn')}
              </button>
            </div>

            {isPassOnOpen && (
              <div className="mt-4 space-y-3">
                {candidates.length === 0 ? (
                  <p className="text-sm text-stone-400">{t('account.contracts.noCandidates')}</p>
                ) : (
                  <>
                    <label
                      htmlFor={`pass-on-${contract.id}`}
                      className="block text-xs font-medium text-stone-400"
                    >
                      {t('account.contracts.selectCustomer')}
                    </label>

                    <select
                      id={`pass-on-${contract.id}`}
                      value={selectedCandidateId}
                      onChange={(event) => setSelectedCandidateId(event.target.value)}
                      className="w-full appearance-none rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 outline-none focus:border-emerald-500"
                    >
                      <option value="">{t('account.contracts.selectCustomerPlaceholder')}</option>
                      {candidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidateLabel(candidate)}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={!selectedCandidateId || isBusy}
                      onClick={() =>
                        void endContract(contract.id, 'passed_on', selectedCandidateId)
                      }
                      className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-stone-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('account.contracts.confirmPassOn')}
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setPassOnContractId(null);
                    setCandidates([]);
                    setSelectedCandidateId('');
                  }}
                  className="ml-2 text-sm text-stone-400 hover:text-stone-200"
                >
                  {t('account.contracts.cancel')}
                </button>
              </div>
            )}
          </div>
        )}

        {contract.status === 'active' && contract.end_choice === 'expired' && (
          <div className="mt-5 rounded-xl border border-amber-900/50 bg-amber-950/20 p-4">
            <p className="text-sm font-medium text-amber-300">
              {t('account.contracts.windowExpired')}
            </p>
            <p className="mt-1 text-sm text-stone-400">
              {t('account.contracts.windowExpiredDescription')}
            </p>
          </div>
        )}

        {contract.status !== 'active' && (
          <div className="mt-5 border-t border-stone-800 pt-4">
            <p className="text-xs text-stone-500">{t('account.contracts.actualEndDate')}</p>
            <p className="mt-1 text-sm text-stone-200">
              {contract.actual_end_on ? formatDate(contract.actual_end_on, locale) : '—'}
            </p>

            {contract.status === 'passed_on' && contract.passed_to_name && (
              <p className="mt-3 text-sm text-stone-400">
                {t('account.contracts.passedTo')}: {contract.passed_to_name}
              </p>
            )}
          </div>
        )}
      </article>
    );
  }

  return (
    <div className="space-y-8">
      {actionError && (
        <p
          className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300"
          role="alert"
        >
          {actionError}
        </p>
      )}

      {activeContracts.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-stone-100">
            {t('account.contracts.activeTitle')}
          </h2>
          {activeContracts.map(renderContract)}
        </section>
      )}

      {decisionContracts.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-stone-100">
            {t('account.contracts.decisionsTitle')}
          </h2>
          {decisionContracts.map(renderContract)}
        </section>
      )}

      {completedContracts.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-stone-100">
            {t('account.contracts.completedTitle')}
          </h2>
          {completedContracts.map(renderContract)}
        </section>
      )}
    </div>
  );
}
