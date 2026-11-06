// Admin, Signatures (card 6): every company application that waits for, or was decided by,
// the person allowed to sign for the company. No real email is sent; instead each request
// opens a page where staff act as that person and sign or decline it.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { SignatureStatusBadge } from '@/components/signature-status-badge';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { appDate } from '@/server/app-date';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';
import { listSignatureRequests } from '@/server/signatures';

export default async function SignaturesPage({ params }: PageProps<'/[locale]/admin/signatures'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const { today } = await appDate();
  const [requests, assets] = await Promise.all([listSignatureRequests(db, today), listAssets(db)]);
  const name = new Map(assets.map((a) => [a.id, `${a.make} ${a.model}`]));
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  // Waiting ones first: those are the ones to act on.
  const sorted = [...requests].sort(
    (a, b) => Number(b.status === 'waiting') - Number(a.status === 'waiting')
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={`/${locale}/admin`}
        className="text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400"
      >
        ← {t('admin.title')}
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
        {t('signatures.title')}
      </h1>
      <p className="mt-3 max-w-3xl text-lg text-stone-700 dark:text-stone-300">
        {t('signatures.intro')}
      </p>

      {sorted.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {t('signatures.empty')}
        </p>
      ) : (
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {sorted.map((request) => (
            <li
              key={request.id}
              className="flex flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold">
                  {request.applicant.company ?? request.applicant.name}
                </h2>
                <SignatureStatusBadge status={request.status} t={t} />
              </div>
              <p className="mt-1 text-sm text-stone-700 dark:text-stone-300">
                {request.assetIds.length === 1
                  ? (name.get(request.assetIds[0] ?? '') ?? request.assetIds[0])
                  : t('signatures.fleetOf', { count: request.assetIds.length })}{' '}
                · {t('apply.termValue', { months: request.termMonths })} ·{' '}
                {t('signatures.monthly', { amount: euro(request.monthlyGrossCents) })}
              </p>
              <dl className="mt-3 grid gap-1 text-sm">
                <div className="flex gap-2">
                  <dt className="text-stone-600 dark:text-stone-400">{t('signatures.sentTo')}</dt>
                  <dd className="font-medium break-all">{request.signatoryEmail ?? '—'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-stone-600 dark:text-stone-400">{t('signatures.askedBy')}</dt>
                  <dd>{request.applicant.name}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-stone-600 dark:text-stone-400">
                    {t('signatures.validUntil')}
                  </dt>
                  <dd>
                    <time dateTime={request.validUntil}>
                      {formatIsoDate(request.validUntil, locale)}
                    </time>
                  </dd>
                </div>
              </dl>
              <Link
                href={`/${locale}/admin/signatures/${request.id}`}
                className="mt-4 inline-block self-start rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                {request.status === 'waiting'
                  ? t('signatures.openAs', { email: request.signatoryEmail ?? '—' })
                  : t('signatures.view')}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
