import Link from 'next/link';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

/** Spine step 6: the term is over and the customer chooses what happens to the item. */
export function TermEndedNotice({
  locale,
  leaseId,
  endDate,
  itemName,
  buyoutTotal,
}: {
  locale: Locale;
  leaseId: string;
  endDate: string;
  itemName: string;
  buyoutTotal: string;
}) {
  const t = getT(locale);
  const base = `/${locale}/account/leases/${encodeURIComponent(leaseId)}`;
  const button =
    'pressable inline-flex min-h-target items-center rounded-pill px-5 text-caption font-semibold';
  return (
    <section
      aria-labelledby="term-ended-title"
      className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-950 sm:p-6"
    >
      <h3 id="term-ended-title" className="text-tagline font-semibold">
        {t('termEnded.title', { date: formatIsoDate(endDate, locale) })}
      </h3>
      <p className="mt-3">{t('termEnded.body', { item: itemName, amount: buyoutTotal })}</p>
      <p className="mt-2 text-caption">{t('termEnded.noBilling')}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href={`${base}/buyout`} className={`${button} bg-ink text-white`}>
          {t('termEnded.buy')}
        </Link>
        <Link href={`${base}/return`} className={`${button} border border-amber-300 bg-white`}>
          {t('termEnded.return')}
        </Link>
      </div>
    </section>
  );
}
