// Spine step 6: the lease has ended, so the customer chooses what happens to the item next:
// buy it, return it, or pass it on to another customer.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { EndOfTermChoices } from '@/components/end-of-term-choices';
import { NotYoursNotice } from '@/components/not-yours-notice';
import { PayAllButton } from '@/components/pay-all-button';
import { loadCustomers } from '@/data/load';
import { buyoutQuote, endOfTermChoice } from '@/domain/end-of-term';
import { formatEuro } from '@/domain/money';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { appDate } from '@/server/app-date';
import { assetOn } from '@/server/asset-state';
import { contractOn } from '@/domain/state-on';
import { TimeTravelNotice } from '@/components/time-travel-notice';
import { getContract } from '@/server/contracts';
import { currentViewer } from '@/server/current-viewer';
import { db } from '@/server/db';
import { contractInvoices } from '@/server/invoices';
import { effectiveVatRates } from '@/server/vat';
import { canSee } from '@/server/viewer';

export default async function EndOfTermPage({ params }: PageProps<'/[locale]/contracts/[id]/end'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const contract = await getContract(db, id);
  if (!contract) notFound();
  const customers = await loadCustomers();
  if (!canSee(await currentViewer(), contract.customerId)) {
    const owner = customers.find((c) => c.id === contract.customerId);
    return <NotYoursNotice ownerName={owner?.name ?? null} locale={locale} t={t} />;
  }

  const { today } = await appDate();
  // As it was on the app's date (time travel): not signed yet, or still running.
  const contractThen = contractOn(contract, today);
  if (!contractThen) {
    return (
      <TimeTravelNotice
        text={t('timeTravel.notSignedYet', { date: formatIsoDate(contract.signedDate, locale) })}
        locale={locale}
        t={t}
      />
    );
  }
  const [item, invoices, vatRates] = await Promise.all([
    assetOn(db, contract.assetId, today),
    contractInvoices(db, contract, today),
    effectiveVatRates(db),
  ]);
  if (!item) notFound();
  const asset = item.asset;
  const choice = endOfTermChoice(contractThen, invoices ?? [], today);
  // Its later history locks the item: the past can be looked at, not changed.
  const locked = item.laterHistory;
  const quote = buyoutQuote(contract.buyoutCents, vatRates, today);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const contractHref = `/${locale}/contracts/${contract.id}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={contractHref}
        className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
      >
        <span aria-hidden="true">&larr;</span>
        {t('invoice.backToContract')}
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">{t('end.title')}</h1>
      <p className="mt-3 max-w-3xl text-lg text-stone-700 dark:text-stone-300">
        {t('end.intro', {
          item: `${asset.make} ${asset.model}`,
          date: formatIsoDate(contract.endDate, locale),
        })}
      </p>

      {locked ? (
        <TimeTravelNotice text={t('timeTravel.lockedItem')} locale={locale} t={t} inline />
      ) : null}

      {!locked && choice.canDecide && !choice.settled ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <p className="mb-3">
            {t('end.unpaid', { count: choice.unpaidCount, total: euro(choice.unpaidCents) })}
          </p>
          <PayAllButton
            contractId={contract.id}
            label={t('invoices.payAll', {
              count: choice.unpaidCount,
              total: euro(choice.unpaidCents),
            })}
            failedLabel={t('pay.failed')}
          />
        </div>
      ) : null}

      {!locked && choice.canDecide ? (
        <div className="mt-8">
          <EndOfTermChoices
            contractId={contract.id}
            actor={contract.signerName}
            settled={choice.settled}
            buyout={
              quote
                ? {
                    net: euro(quote.netCents),
                    vatPercent: formatNumber(quote.vatPercent, locale),
                    vat: euro(quote.vatCents),
                    total: euro(quote.totalCents),
                  }
                : null
            }
            recipients={customers
              .filter((c) => c.id !== contract.customerId)
              .map(({ id: customerId, name }) => ({ id: customerId, name }))}
            locale={locale}
          />
        </div>
      ) : (
        <p className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 text-stone-700 shadow-sm dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
          {choice.reason === 'not_ended'
            ? t('end.notYet', { date: formatIsoDate(contract.endDate, locale) })
            : t('end.decided')}{' '}
          <Link
            href={contractHref}
            className="font-medium text-emerald-800 underline dark:text-emerald-300"
          >
            {t('invoice.backToContract')}
          </Link>
        </p>
      )}
    </div>
  );
}
