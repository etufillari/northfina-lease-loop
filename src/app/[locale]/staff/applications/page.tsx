import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ApplicationReviewForm } from '@/components/application-review-form';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { listReviewApplications } from '@/server/application-review';
import { db } from '@/server/db';

/** #19, card 7: applications waiting for a person. Staff only (the staff layout checks). */
export default async function Page({ params }: PageProps<'/[locale]/staff/applications'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const applications = await listReviewApplications(db);
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <h1 className="font-display text-display-sm font-semibold">{t('review.title')}</h1>
      <p className="mt-3 max-w-2xl text-body text-ink-muted">{t('review.intro')}</p>
      {applications.length ? (
        <ul className="mt-6 space-y-5">
          {applications.map((application) => (
            <li key={application.id} className="rounded-lg border border-hairline p-5">
              <p className="text-tagline font-semibold">{application.customerName}</p>
              <p className="mt-1 text-caption text-ink-muted">
                {t('review.appliedOn', { date: formatIsoDate(application.startDate, locale) })}
              </p>
              <ul className="mt-3 text-caption">
                {application.items.map((item) => (
                  <li key={item.id}>
                    {item.name} · {euro(item.priceCents)} ·{' '}
                    {t('product.months', { count: item.termMonths })}
                    {item.downPaymentCents
                      ? ` · ${t('review.down', { amount: euro(item.downPaymentCents) })}`
                      : ''}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-caption font-semibold">{t('review.reasons')}</p>
              <ul className="mt-1 list-disc pl-5 text-caption">
                {application.reasons.map((reason) => (
                  <li key={reason}>{t(`application.reason.${reason}` as MessageKey)}</li>
                ))}
              </ul>
              <ApplicationReviewForm
                id={application.id}
                labels={{
                  note: t('review.note'),
                  approve: t('review.approve'),
                  reject: t('review.reject'),
                  error: t('review.error'),
                }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-caption">{t('review.empty')}</p>
      )}
    </div>
  );
}
