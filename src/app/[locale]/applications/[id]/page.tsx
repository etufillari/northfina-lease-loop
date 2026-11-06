import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { dateOfAge } from '@/domain/application-fields';
import { UnderAgeHelp } from '@/components/under-age-help';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { applicationItemsSchema, findCustomerApplication } from '@/server/applications';
import { authSettings } from '@/server/auth-config';
import { readIdentity } from '@/server/auth-session';
import { db } from '@/server/db';
import { appToday } from '@/server/demo-mode';

export default async function Page({ params }: PageProps<'/[locale]/applications/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const identity = await readIdentity(db, await headers());
  if (!identity) redirect(`/${locale}/login`);
  const application = await findCustomerApplication(db, identity.customerId, id);
  if (!application) notFound();
  const t = getT(locale);
  const items = applicationItemsSchema.parse(JSON.parse(application.itemsJson));
  const reasons = z.array(z.string()).parse(JSON.parse(application.reasonsJson));
  const monthlyTotal = formatEuro(
    items.reduce((sum, item) => sum + item.monthlyTotalCents, 0),
    intlLocale[locale]
  );
  // An under-age applicant gets a gentle explanation, the date they can apply and the option
  // to ask a parent or guardian, instead of a bare rule.
  const underAge = reasons.includes('under_age');
  const answers = z
    .object({ q_birth_date: z.string().optional(), q_signatory_email: z.string().optional() })
    .catch({})
    .parse(JSON.parse(application.answersJson));
  const adultFrom = answers.q_birth_date ? dateOfAge(answers.q_birth_date, 18) : null;
  const otherReasons = reasons.filter(
    (reason) => !(underAge && reason === 'under_age') && reason !== 'signatory_pending'
  );
  const current = application.startDate === (await appToday());
  // Card 6: the applicant can't sign for the company, so nothing is approved for it until the
  // named signatory signs. Say so instead of "approved".
  const signatoryEmail = answers.q_signatory_email ?? '';
  const awaitingSignatory =
    application.status === 'approved' && reasons.includes('signatory_pending');
  return (
    <div className="mx-auto max-w-copy px-card py-section-compact">
      <h1 className="font-display text-display-sm font-semibold tablet:text-display-lg">
        {underAge
          ? t('application.underAge.title')
          : awaitingSignatory
            ? t('application.status.awaiting_signatory', { email: signatoryEmail })
            : t(`application.status.${application.status}` as MessageKey)}
      </h1>
      {underAge ? (
        <UnderAgeHelp
          t={t}
          adultFrom={adultFrom ? formatIsoDate(adultFrom, locale) : null}
          monthlyTotal={monthlyTotal}
          items={items.map((item) => ({
            name: item.name,
            months: t('product.months', { count: item.termMonths }),
            link: `${authSettings().baseURL}/${locale}/products/${encodeURIComponent(item.id)}`,
          }))}
        />
      ) : (
        <p className="mt-6 max-w-prose text-body text-ink-muted">
          {awaitingSignatory
            ? t('application.outcome.awaiting_signatory', { email: signatoryEmail })
            : t(`application.outcome.${application.status}` as MessageKey)}
        </p>
      )}
      {otherReasons.length ? (
        <ul className="mt-6 list-disc space-y-3 pl-5">
          {otherReasons.map((reason) => (
            <li key={reason}>
              {reason === 'signatory_pending'
                ? t('application.reason.signatory_pending', {
                    email: answers.q_signatory_email ?? '',
                  })
                : t(`application.reason.${reason}` as MessageKey)}
            </li>
          ))}
        </ul>
      ) : null}
      <section className="mt-8 rounded-lg bg-parchment p-card">
        <h2 className="text-tagline font-semibold">{t('cart.summary')}</h2>
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              {item.name} · {t('product.months', { count: item.termMonths })}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-caption">{t('cart.monthlyTotal')}</p>
        <p className="mt-2 text-lead font-semibold">{monthlyTotal}</p>
      </section>
      <p className="mt-6 text-caption text-ink-muted">
        {t(current ? 'application.notice' : 'application.expired')}
      </p>
      <div className="mt-8 flex flex-wrap gap-6">
        {application.status === 'approved' && current ? (
          <Link
            href={`/${locale}/cart?application=${encodeURIComponent(id)}`}
            className="pressable inline-flex min-h-target items-center rounded-pill bg-primary px-6 py-3 text-on-dark"
          >
            {t('application.continue')}
          </Link>
        ) : null}
        <Link
          href={`/${locale}/application`}
          className="inline-flex min-h-target items-center text-primary"
        >
          {t('application.again')}
        </Link>
      </div>
    </div>
  );
}
