'use client';

import Link from 'next/link';
import type { EligibilityReason } from '@/data/lease-schemas';
import type { Locale } from '@/i18n/locales';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';

type ApplicationDecision = 'approved' | 'rejected' | 'manual_review';

export type ApplicationResultData = {
  id: string;
  decision: ApplicationDecision;
  reasons: EligibilityReason[];
  eligible_from: string | null;
};

type ApplicationResultProps = {
  application: ApplicationResultData;
  locale: Locale;
};

const decisionStyles: Record<
  ApplicationDecision,
  {
    icon: string;
    styles: string;
  }
> = {
  approved: {
    icon: '✓',
    styles: 'border-emerald-900 bg-emerald-950/40 text-emerald-300',
  },
  rejected: {
    icon: '!',
    styles: 'border-red-900 bg-red-950/40 text-red-300',
  },
  manual_review: {
    icon: '…',
    styles: 'border-amber-900 bg-amber-950/40 text-amber-300',
  },
};

export default function ApplicationResult({ application, locale }: ApplicationResultProps) {
  const t = getT(locale);
  const content = decisionStyles[application.decision];

  const decisionKey = application.decision;

  return (
    <div className="space-y-6">
      <div className={`rounded-2xl border p-6 ${content.styles}`} role="status">
        <div className="flex size-10 items-center justify-center rounded-full border border-current text-xl font-semibold">
          {content.icon}
        </div>

        <h2 className="mt-4 text-xl font-semibold">
          {t(`application.result.${decisionKey}.title`)}
        </h2>

        <p className="mt-2 text-sm opacity-90">
          {t(`application.result.${decisionKey}.description`)}
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold text-stone-100">
            {t('application.result.details')}
          </h3>

          <span className="font-mono text-xs text-stone-400">#{application.id}</span>
        </div>

        {application.reasons.length > 0 && (
          <div className="rounded-xl border border-stone-800 bg-stone-900 p-4">
            <h4 className="text-sm font-medium text-stone-100">
              {t(
                application.decision === 'rejected'
                  ? 'application.result.reasons'
                  : 'application.result.additionalInformation'
              )}
            </h4>

            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-stone-400">
              {application.reasons.map((reason, index) => (
                <li key={`${reason}-${index}`}>{t(`application.reason.${reason}`)}</li>
              ))}
            </ul>
          </div>
        )}

        {application.eligible_from && (
          <p className="text-sm text-stone-400">
            {t('application.result.eligibleFrom')}{' '}
            {formatIsoDate(application.eligible_from, locale)}
          </p>
        )}
      </section>

      <div className="rounded-xl border border-stone-800 bg-stone-900 p-5">
        <h3 className="text-sm font-semibold text-stone-100">
          {t(`application.result.${decisionKey}.nextTitle`)}
        </h3>

        <p className="mt-2 text-sm leading-6 text-stone-400">
          {t(`application.result.${decisionKey}.nextDescription`)}
        </p>
      </div>

      {application.decision === 'approved' && (
        <Link
          href={`/${locale}/account/contracts/${application.id}`}
          className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          {t('account.applications.continueToContract')}
        </Link>
      )}

      <Link
        href={`/${locale}/account/applications`}
        className="inline-flex w-full items-center justify-center rounded-xl border border-stone-700 px-4 py-3 text-sm font-semibold text-stone-200 transition hover:bg-stone-800"
      >
        {t('application.result.viewApplications')}
      </Link>
    </div>
  );
}
