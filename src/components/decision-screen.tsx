'use client';
// The application's decision, rule by rule, and — when approved — the start-date picker and
// the happy-path signature button. Split out of the wizard to keep files under 600 lines.
import Link from 'next/link';
import { formatEuro } from '@/domain/money';
import { getT, type MessageKey, type Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export type DecisionReason = {
  rule: string;
  outcome: string;
  params?: Record<string, string | number>;
};

export function DecisionScreen({
  locale,
  suffix,
  status,
  holdUntil,
  signatoryEmail,
  reasons,
  startDate,
  setStartDate,
  error,
  busy,
  onSign,
}: {
  locale: Locale;
  suffix: string;
  status: 'approved' | 'manual_review' | 'awaiting_signature' | 'declined' | 'signed';
  holdUntil: string | null;
  signatoryEmail: string | null;
  reasons: DecisionReason[] | null;
  startDate: string;
  setStartDate: (value: string) => void;
  error: string | null;
  busy: boolean;
  onSign: () => void;
}) {
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const textKey = status === 'signed' ? 'approved' : status;

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t(`decision.${textKey}.title` as MessageKey)}</h1>
      <p className="mt-2 text-stone-700 dark:text-stone-300">
        {t(`decision.${textKey}.text` as MessageKey, {
          date: holdUntil ?? '',
          email: signatoryEmail ?? '',
        })}
      </p>

      {reasons ? (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
          <h2 className="text-sm font-semibold">{t('decision.reasonsTitle')}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {reasons.map((reason) => (
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
                  {reason.rule === 'affordability' && reason.params?.note === 'income_not_asked' ? (
                    <p className="text-stone-600 dark:text-stone-400">
                      {t('reason.affordability.notAsked')}
                    </p>
                  ) : null}
                </div>
                <OutcomeBadge t={t} outcome={reason.outcome} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {status === 'approved' ? (
        <div className="mt-6">
          <label htmlFor="sign-start" className="block text-sm font-medium">
            {t('apply.startDate')}
          </label>
          <input
            id="sign-start"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="mt-1 rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
          />
          <p className="mt-1 text-xs text-stone-500">{t('apply.startDateHint')}</p>
        </div>
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
      </div>
    </div>
  );
}

function OutcomeBadge({ t, outcome }: { t: Translate; outcome: string }) {
  const styles: Record<string, string> = {
    passed:
      'bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800',
    failed:
      'bg-red-50 text-red-900 ring-red-200 dark:bg-red-950 dark:text-red-200 dark:ring-red-800',
    manual_review:
      'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800',
    not_applicable:
      'bg-stone-100 text-stone-600 ring-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:ring-stone-700',
  };
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[outcome] ?? styles.not_applicable}`}
    >
      {t(`outcome.${outcome}` as MessageKey)}
    </span>
  );
}
