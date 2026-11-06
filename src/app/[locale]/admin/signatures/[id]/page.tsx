// Admin, Signatures, one request (card 6): staff act as the person the applicant named as
// allowed to sign for the company. It shows what the "email" would contain (none is sent),
// and lets that person sign or decline. Signing makes the contracts out to the applicant's
// account, so the applicant gets the invoices.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { SignatoryActions } from '@/components/signatory-actions';
import { SignatureStatusBadge } from '@/components/signature-status-badge';
import { TimeTravelNotice } from '@/components/time-travel-notice';
import { contractNumber } from '@/domain/contract';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { appDate } from '@/server/app-date';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';
import { getSignatureRequest } from '@/server/signatures';

export default async function SignatureRequestPage({
  params,
}: PageProps<'/[locale]/admin/signatures/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const { today } = await appDate();
  const [request, assets] = await Promise.all([getSignatureRequest(db, id, today), listAssets(db)]);
  if (!request) notFound();
  const name = new Map(assets.map((a) => [a.id, `${a.make} ${a.model}`]));
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const date = (iso: string) => <time dateTime={iso}>{formatIsoDate(iso, locale)}</time>;
  const company = request.applicant.company ?? request.applicant.name;
  const email = request.signatoryEmail ?? '—';

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={`/${locale}/admin/signatures`}
        className="text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400"
      >
        ← {t('signatures.title')}
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('signatures.requestTitle', { company })}
        </h1>
        <SignatureStatusBadge status={request.status} t={t} />
      </div>
      <p className="mt-3 rounded-xl bg-violet-50 p-3 text-sm text-violet-950 ring-1 ring-violet-200 ring-inset dark:bg-violet-950 dark:text-violet-100 dark:ring-violet-800">
        {t('signatures.actingAs', { email })}
      </p>

      {/* What the signatory would get by email (none is sent in this demo). */}
      <section
        aria-labelledby="request-email-heading"
        className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900"
      >
        <h2 id="request-email-heading" className="text-lg font-semibold">
          {t('signatures.emailSubject', { name: request.applicant.name, company })}
        </h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          {t('signatures.emailTo', { email })}
        </p>
        <p className="mt-4 text-stone-700 dark:text-stone-300">
          {t('signatures.emailBody', {
            name: request.applicant.name,
            company,
            until: formatIsoDate(request.validUntil, locale),
          })}
        </p>

        <ul className="mt-4 divide-y divide-stone-100 text-sm dark:divide-stone-800">
          {request.assetIds.map((assetId) => (
            <li key={assetId} className="flex justify-between gap-4 py-2">
              <Link
                href={`/${locale}/assets/${assetId}`}
                className="font-medium text-emerald-800 underline underline-offset-4 dark:text-emerald-300"
              >
                {name.get(assetId) ?? assetId}
              </Link>
              <span className="font-mono text-xs text-stone-600 dark:text-stone-400">
                {assetId}
              </span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <Fact
            label={t('apply.term')}
            value={t('apply.termValue', { months: request.termMonths })}
          />
          <Fact
            label={t('signatures.monthlyLabel')}
            value={t('apply.monthlyValue', {
              gross: euro(request.monthlyGrossCents),
              net: euro(request.monthlyNetCents),
            })}
          />
          <Fact label={t('signatures.validUntil')} value={date(request.validUntil)} />
        </dl>
        <p className="mt-4 text-sm text-stone-700 dark:text-stone-300">
          {t('signatures.invoicesTo', {
            company,
            name: request.applicant.name,
            email: request.applicant.email ?? '—',
          })}
        </p>
      </section>

      {request.laterHistory ? (
        <TimeTravelNotice text={t('signatures.laterHistory')} locale={locale} t={t} inline />
      ) : null}

      <section aria-labelledby="request-outcome-heading" className="mt-8">
        <h2 id="request-outcome-heading" className="text-lg font-semibold">
          {t('signatures.outcome')}
        </h2>
        {request.status === 'waiting' && !request.laterHistory ? (
          <SignatoryActions requestId={request.id} locale={locale} />
        ) : request.status === 'waiting' ? (
          <p className="mt-2 text-stone-700 dark:text-stone-300">{t('signatures.waitingText')}</p>
        ) : request.status === 'signed' && request.signedDate ? (
          <div className="mt-2 text-stone-700 dark:text-stone-300">
            <p>{t('signatures.signedText', { date: formatIsoDate(request.signedDate, locale) })}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {request.contractIds.map((contractId) => (
                <li key={contractId}>
                  <Link
                    href={`/${locale}/contracts/${contractId}`}
                    className="font-medium text-emerald-800 underline underline-offset-4 dark:text-emerald-300"
                  >
                    {t('signatures.contractLink', { number: contractNumber(contractId) })}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : request.status === 'declined' && request.declined ? (
          <Outcome>
            {t('signatures.declinedText', {
              by: request.declined.by ?? email,
              date: formatIsoDate(request.declined.date, locale),
            })}
            {request.declined.note ? (
              <span className="mt-1 block italic">“{request.declined.note}”</span>
            ) : null}
          </Outcome>
        ) : request.status === 'expired' ? (
          <Outcome>
            {t('signatures.expiredText', { date: formatIsoDate(request.validUntil, locale) })}
          </Outcome>
        ) : (
          <Outcome>
            {t('signatures.needsReviewText', {
              reasons: request.otherReasons
                .map((r) => t(`apply.reason.${r}`, { min: '', max: '' }))
                .join(' '),
            })}
          </Outcome>
        )}
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-stone-50 p-3 dark:bg-stone-800/50">
      <dt className="text-xs font-medium text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}

function Outcome({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-stone-700 dark:text-stone-300">{children}</p>;
}
