'use client';

// One application waiting for a person. Deciding asks the server, which checks the role and
// that the case is still open, then the page reloads its list and this card is gone.
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { formatAnswer } from '@/components/application/format-answer';
import { ApplicationStatusBadge } from '@/components/ui/application-status-badge';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import type { ReviewCase } from '@/server/application/manual-review';

type Decision = 'approved' | 'rejected';

type ManualReviewCardProps = {
  reviewCase: ReviewCase;
  locale: Locale;
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-stone-200">{value}</p>
    </div>
  );
}

export function ManualReviewCard({ reviewCase, locale }: ManualReviewCardProps) {
  const t = getT(locale);
  const router = useRouter();

  const [saving, setSaving] = useState<Decision | null>(null);
  const [failed, setFailed] = useState(false);

  async function decide(decision: Decision) {
    setSaving(decision);
    setFailed(false);

    try {
      const response = await fetch(`/api/applications/${reviewCase.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (!response.ok) throw new Error('decision failed');
    } catch {
      setSaving(null);
      setFailed(true);
    }

    // Also after a failure: someone else may have settled this case in the meantime.
    router.refresh();
  }

  const customerType = reviewCase.customer_type
    ? t(`application.options.q_customer_type.${reviewCase.customer_type}`)
    : null;
  const titleId = `review-${reviewCase.id}`;

  return (
    <article
      aria-labelledby={titleId}
      className="space-y-6 rounded-2xl border border-stone-800 bg-stone-900 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-semibold text-stone-100">
            {reviewCase.customer_name}
          </h2>
          {customerType && <p className="mt-1 text-sm text-stone-400">{customerType}</p>}
          <p className="mt-1 break-all font-mono text-xs text-stone-500">{reviewCase.id}</p>
        </div>

        <ApplicationStatusBadge status="manual_review" t={t} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Fact label={t('admin.review.item')} value={reviewCase.asset_name} />
        <Fact label={t('asset.price')} value={formatEuro(reviewCase.base_price_cents, locale)} />
        <Fact
          label={t('asset.downPayment')}
          value={formatEuro(reviewCase.down_payment_cents, locale)}
        />
        <Fact
          label={t('account.applications.financedAmount')}
          value={formatEuro(reviewCase.financed_cents, locale)}
        />
        <Fact
          label={t('asset.leaseTerm')}
          value={t('asset.leaseDuration', { months: reviewCase.term_months })}
        />
        <Fact label={t('asset.quoteDate')} value={reviewCase.quote_date} />
      </div>

      <section className="rounded-xl border border-amber-900 bg-amber-950/40 p-4">
        <h3 className="text-sm font-semibold text-amber-200">{t('admin.review.why')}</h3>

        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-300">
          {reviewCase.reasons.map((reason) => (
            <li key={reason}>{t(`application.reason.${reason}`)}</li>
          ))}
          {reviewCase.recorded_pep && <li>{t('admin.review.recordedPep')}</li>}
        </ul>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-stone-100">{t('admin.review.answers')}</h3>

        <dl className="mt-2 divide-y divide-stone-800 rounded-xl border border-stone-800 px-4">
          {reviewCase.answers.map(({ id, text, value }) => (
            <div key={id} className="grid gap-1 py-3 sm:grid-cols-2 sm:gap-4">
              <dt className="text-sm text-stone-400">{text}</dt>
              <dd className="break-words text-sm font-medium text-stone-100">
                {formatAnswer(id, value, locale)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {failed && (
        <p role="alert" className="text-sm text-red-400">
          {t('admin.review.error')}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-stone-800 pt-5 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => void decide('rejected')}
          disabled={saving !== null}
          className="rounded-xl border border-red-900 px-5 py-2.5 text-sm font-medium text-red-300 transition-colors hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving === 'rejected' ? t('admin.review.saving') : t('admin.review.reject')}
        </button>

        <button
          type="button"
          onClick={() => void decide('approved')}
          disabled={saving !== null}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving === 'approved' ? t('admin.review.saving') : t('admin.review.approve')}
        </button>
      </div>
    </article>
  );
}
