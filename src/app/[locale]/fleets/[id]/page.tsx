// One fleet: its items and totals, the decision, and one signature for every contract.
// Once signed, it links to each item's own contract (invoices, end of term work per item).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { NotYoursNotice } from '@/components/not-yours-notice';
import { SignatureNotice } from '@/components/signature-notice';
import { SignContractForm } from '@/components/sign-contract-form';
import { loadAssets, loadCustomers } from '@/data/load';
import { checkSignable, contractNumber } from '@/domain/contract';
import { formatEuro } from '@/domain/money';
import { contractOn } from '@/domain/state-on';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { appDate } from '@/server/app-date';
import { currentViewer } from '@/server/current-viewer';
import { db } from '@/server/db';
import { getFleet } from '@/server/fleets';
import { getSignatureRequest } from '@/server/signatures';
import { canSee } from '@/server/viewer';

export default async function FleetOverviewPage({ params }: PageProps<'/[locale]/fleets/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const fleet = await getFleet(db, id);
  if (!fleet) notFound();
  if (!canSee(await currentViewer(), fleet.customerId)) {
    const owner = (await loadCustomers()).find((c) => c.id === fleet.customerId);
    return <NotYoursNotice ownerName={owner?.name ?? null} locale={locale} t={t} />;
  }
  const { today } = await appDate();
  const assets = await loadAssets();
  const name = new Map(assets.map((a) => [a.id, `${a.make} ${a.model}`]));
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  // Signed on or before the app's date (time travel goes both ways).
  const contracts = fleet.contracts.flatMap((c) => contractOn(c, today) ?? []);
  const contractOf = new Map(contracts.map((c) => [c.assetId, c]));
  const signed = contracts[0] ?? null;
  const first = fleet.applications[0];
  const check = first
    ? checkSignable({ decision: fleet.decision, quoteDate: fleet.quoteDate, signDate: today })
    : null;
  const signatoryEmail = first?.answers.q_signatory_email?.trim() || null;
  // Card 6: waiting for the company's signatory, or decided by them.
  const signature = await getSignatureRequest(db, fleet.id, today);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={`/${locale}/fleet`}
        className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
      >
        <span aria-hidden="true">&larr;</span>
        {t('fleet.back')}
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">
        {t('fleet.overviewTitle', { name: fleet.applicantName ?? '' })}
      </h1>
      <p className="mt-3 text-stone-700 dark:text-stone-300">
        {t('fleet.overviewIntro', {
          count: fleet.totals.count,
          months: fleet.termMonths,
          date: formatIsoDate(fleet.quoteDate, locale),
        })}
      </p>

      <section className="mt-6 overflow-x-auto rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <table className="w-full min-w-[32rem] text-sm tabular-nums">
          <caption className="sr-only">{t('fleet.itemsCaption')}</caption>
          <thead className="text-left text-stone-600 dark:text-stone-400">
            <tr className="border-b border-stone-200 dark:border-stone-700">
              <th scope="col" className="py-2 pr-3 font-medium">
                {t('apply.item')}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                {t('price.financed')}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                {t('price.monthlyNet')}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {t('price.monthlyGross')}
              </th>
            </tr>
          </thead>
          <tbody>
            {fleet.applications.map((application) => {
              const contract = contractOf.get(application.assetId);
              return (
                <tr
                  key={application.id}
                  className="border-b border-stone-100 dark:border-stone-800"
                >
                  <td className="py-2 pr-3">
                    {contract ? (
                      <Link
                        href={`/${locale}/contracts/${contract.id}`}
                        className="font-medium text-emerald-800 underline underline-offset-4 dark:text-emerald-300"
                      >
                        {name.get(application.assetId) ?? application.assetId}
                      </Link>
                    ) : (
                      <span className="font-medium">
                        {name.get(application.assetId) ?? application.assetId}
                      </span>
                    )}
                    <span className="block text-xs text-stone-600 dark:text-stone-400">
                      {application.assetId}
                      {contract
                        ? ` · ${t('fleet.contractNo', { number: contractNumber(contract.id) })}`
                        : ''}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right">{euro(application.financedCents)}</td>
                  <td className="py-2 pr-3 text-right">{euro(application.monthlyNetCents)}</td>
                  <td className="py-2 text-right">{euro(application.monthlyGrossCents)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <th scope="row" className="py-2 pr-3 text-left">
                {t('fleet.total')}
              </th>
              <td className="py-2 pr-3 text-right">{euro(fleet.totals.financedCents)}</td>
              <td className="py-2 pr-3 text-right">{euro(fleet.totals.monthlyNetCents)}</td>
              <td className="py-2 text-right">{euro(fleet.totals.monthlyGrossCents)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-3 text-xs text-stone-600 dark:text-stone-400">{t('fleet.priceNote')}</p>
      </section>

      {signed ? (
        <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
          <p className="font-semibold">
            {t('fleet.signed', {
              date: formatIsoDate(signed.signedDate, locale),
              name: signed.signerName,
            })}
          </p>
          <p className="mt-2">{t('fleet.signedText')}</p>
        </section>
      ) : check?.ok ? (
        <>
          <p className="mt-6 text-stone-700 dark:text-stone-300">
            {t('fleet.signIntro', { date: formatIsoDate(check.quoteValidUntil, locale) })}
          </p>
          <SignContractForm
            target={{ fleetId: fleet.id }}
            defaultName={fleet.applicantName ?? ''}
            applicantFullName={fleet.applications[0]?.answers.q_full_name}
            locale={locale}
          />
        </>
      ) : signature ? (
        <SignatureNotice request={signature} locale={locale} t={t} />
      ) : (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-semibold">
            {check?.reason === 'not_approved'
              ? t(`apply.decision.${fleet.decision}`)
              : t('contract.error.expired')}
          </p>
          <p className="mt-2">
            {check?.reason === 'not_approved'
              ? t(`contract.cannotSign.${fleet.decision}`)
              : t('contract.expiredText', {
                  date: formatIsoDate(check?.quoteValidUntil ?? fleet.quoteDate, locale),
                })}
          </p>
          {fleet.reasons.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {fleet.reasons.map((reason) => (
                <li key={reason}>{t(`apply.reason.${reason}`, { min: '', max: '' })}</li>
              ))}
            </ul>
          ) : null}
          {fleet.reasons.includes('signatory_authorization') && signatoryEmail ? (
            <p className="mt-3 text-sm">{t('fleet.signatory', { email: signatoryEmail })}</p>
          ) : null}
        </section>
      )}
    </div>
  );
}
