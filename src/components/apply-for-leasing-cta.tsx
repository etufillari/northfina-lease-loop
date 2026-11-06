import Link from 'next/link';

import type { Locale } from '@/i18n/locales';
import type { Translate } from '@/i18n/get-t';

type ApplyForLeasingCtaProps = {
  assetId: string;
  termMonths: number;
  downPaymentCents: number;
  locale: Locale;
  t: Translate;
};

export function ApplyForLeasingCta({
  assetId,
  termMonths,
  downPaymentCents,
  locale,
  t,
}: ApplyForLeasingCtaProps) {
  const deal = new URLSearchParams({ term: String(termMonths), down: String(downPaymentCents) });

  return (
    <div className="mt-6 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
      <h3 className="font-semibold">{t('asset.readyToLease')}</h3>

      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        {t('asset.leaseApplicationDescription')}
      </p>

      <Link
        href={`/${locale}/assets/${assetId}/apply?${deal.toString()}`}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
      >
        {t('asset.applyForLeasing')}
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
