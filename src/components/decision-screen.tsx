'use client';
// The application's decision. Approved applications show no rule list at all; other
// outcomes list only the rules that did not pass. The start date was chosen at submission,
// so here it is just shown — and the customer can still cancel before signing.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT, type MessageKey, type Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export type DecisionReason = {
  rule: string;
  outcome: string;
  params?: Record<string, string | number>;
};

export type DecisionStatus =
  'approved' | 'manual_review' | 'awaiting_signature' | 'declined' | 'signed' | 'cancelled';

/** Statuses the customer can still walk away from. */
const CANCELLABLE: DecisionStatus[] = ['approved', 'manual_review', 'awaiting_signature'];

export function DecisionScreen({
  locale,
  suffix,
  status,
  holdUntil,
  signatoryEmail,
  reasons,
  startDate,
  error,
  busy,
  onSign,
  onCancel,
  isTransfer,
  summary,
}: {
  locale: Locale;
  suffix: string;
  status: DecisionStatus;
  holdUntil: string | null;
  signatoryEmail: string | null;
  reasons: DecisionReason[] | null;
  /** Chosen at submission; a transfer keeps the original schedule and has none. */
  startDate: string | null;
  error: string | null;
  busy: boolean;
  onSign: () => void;
  onCancel: () => void;
  isTransfer?: boolean;
  /** The lease summary, shown in the middle of the page once there is a decision. */
  summary?: ReactNode;
}) {
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const textKey = status === 'signed' ? 'approved' : status;
  // Only what did NOT pass is worth reading; an approval needs no rule list at all.
  const failing =
    status === 'approved' || status === 'signed' || status === 'cancelled'
      ? []
      : (reasons ?? []).filter((r) => r.outcome === 'failed' || r.outcome === 'manual_review');

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t(`decision.${textKey}.title` as MessageKey)}</h1>
      <p className="mt-2 text-stone-700 dark:text-stone-300">
        {t(`decision.${textKey}.text` as MessageKey, {
          date: holdUntil ?? '',
          email: signatoryEmail ?? '',
        })}
      </p>

      {summary && status !== 'cancelled' ? <div className="mt-6">{summary}</div> : null}

      {failing.length > 0 ? (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
          <h2 className="text-sm font-semibold">{t('decision.reasonsTitle')}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {failing.map((reason) => (
              <li key={reason.rule} className="flex items-start justify-between gap-4">
                <div>
                  <p>{t(`reason.${reason.rule}` as MessageKey)}</p>
                  {reason.rule === 'min_age' && reason.outcome === 'failed' ? (
                    <p className="text-stone-600 dark:text-stone-400">
                      {t('reason.min_age.eligibleFrom', {
                        date: String(reason.params?.eligibleFrom ?? ''),
                      })}
                    </p>
                  ) : null}
                  {reason.rule === 'affordability' && reason.params?.limitCents !== undefined ? (
                    <p className="text-stone-600 dark:text-stone-400">
                      {t('reason.affordability.detail', {
                        rent: euro(Number(reason.params.monthlyRentWithVatCents ?? 0)),
                        limit: euro(Number(reason.params.limitCents)),
                      })}
                    </p>
                  ) : null}
                </div>
                <OutcomeBadge t={t} outcome={reason.outcome} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {status === 'approved' && !isTransfer && startDate && !summary ? (
        <p className="mt-6 text-sm">
          <span className="font-medium">{t('apply.startDate')}:</span>{' '}
          {formatIsoDate(startDate, locale)}
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200 ring-inset dark:bg-red-950 dark:text-red-200 dark:ring-red-800">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        {status === 'approved' ? (
          <button
            type="button"
            onClick={onSign}
            disabled={busy}
            className="rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {t('decision.sign')}
          </button>
        ) : null}
        <Link
          href={`/${locale}${suffix}`}
          className="rounded-xl px-4 py-3 font-medium ring-1 ring-stone-300 ring-inset hover:bg-stone-50 dark:ring-stone-700 dark:hover:bg-stone-800"
        >
          {t('asset.backToCatalogue')}
        </Link>
        {CANCELLABLE.includes(status) ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl px-4 py-3 font-medium text-red-800 ring-1 ring-red-200 ring-inset hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:ring-red-900 dark:hover:bg-red-950"
          >
            {t('decision.cancel')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function OutcomeBadge({ t, outcome }: { t: Translate; outcome: string }) {
  const styles: Record<string, string> = {
    failed:
      'bg-red-50 text-red-900 ring-red-200 dark:bg-red-950 dark:text-red-200 dark:ring-red-800',
    manual_review:
      'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800',
  };
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[outcome] ?? styles.failed}`}
    >
      {t(`outcome.${outcome}` as MessageKey)}
    </span>
  );
}
