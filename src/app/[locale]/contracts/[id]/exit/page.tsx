// Ending a lease early (Smart Problem 2), with the calculation shown step by step so the
// customer can see why it costs what it costs. The formula is in src/domain/early-exit.ts.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { EarlyExitButtons } from '@/components/early-exit-buttons';
import { NotYoursNotice } from '@/components/not-yours-notice';
import { PayAllButton } from '@/components/pay-all-button';
import { TimeTravelNotice } from '@/components/time-travel-notice';
import { loadCustomers } from '@/data/load';
import { formatEuro } from '@/domain/money';
import { contractOn } from '@/domain/state-on';
import { formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { appDate } from '@/server/app-date';
import { hasLaterHistory } from '@/server/asset-state';
import { getContract } from '@/server/contracts';
import { currentViewer } from '@/server/current-viewer';
import { db } from '@/server/db';
import { earlyExitFor } from '@/server/early-exit';
import { canSee } from '@/server/viewer';

export default async function EarlyExitPage({
  params,
}: PageProps<'/[locale]/contracts/[id]/exit'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const stored = await getContract(db, id);
  if (!stored) notFound();
  if (!canSee(await currentViewer(), stored.customerId)) {
    const owner = (await loadCustomers()).find((c) => c.id === stored.customerId);
    return <NotYoursNotice ownerName={owner?.name ?? null} locale={locale} t={t} />;
  }
  const { today } = await appDate();
  const contract = contractOn(stored, today);
  const contractHref = `/${locale}/contracts/${stored.id}`;
  const back = (
    <Link
      href={contractHref}
      className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
    >
      <span aria-hidden="true">&larr;</span>
      {t('invoice.backToContract')}
    </Link>
  );
  const [info, locked] = contract
    ? await Promise.all([
        earlyExitFor(db, contract, today),
        hasLaterHistory(db, stored.assetId, today),
      ])
    : [null, false];
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);

  if (!contract || !info || !info.ok) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        {back}
        <p className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
          {t('exit.notRunning')}
        </p>
      </div>
    );
  }
  const q = info.quote;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      {back}
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{t('exit.title')}</h1>
      <p className="mt-3 text-lg text-stone-700 dark:text-stone-300">{t('exit.intro')}</p>

      {locked ? (
        <TimeTravelNotice text={t('timeTravel.lockedItem')} locale={locale} t={t} inline />
      ) : null}

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <h2 className="text-lg font-semibold">{t('exit.howTitle')}</h2>
        <dl className="mt-4 space-y-2 text-sm tabular-nums">
          <Row
            label={t('exit.remaining', { months: q.remainingMonths, total: contract.termMonths })}
            value={euro(q.remainingRentsCents)}
          />
          <Row
            label={t('exit.rate', {
              annual: formatNumber(Math.round(q.monthlyRatePercent * 12 * 100) / 100, locale),
              monthly: formatNumber(Math.round(q.monthlyRatePercent * 1000) / 1000, locale),
            })}
            value=""
          />
          <Row label={t('exit.presentRents')} value={euro(q.presentRentsCents)} />
          <Row
            label={t('exit.presentBuyout', { buyout: euro(contract.buyoutCents) })}
            value={euro(q.presentBuyoutCents)}
          />
          <Row label={t('exit.stillOwed')} value={euro(q.stillOwedCents)} strong />
          <Row label={t('exit.marketValue')} value={euro(q.marketValueCents)} />
        </dl>
        <p className="mt-4 text-sm text-stone-700 dark:text-stone-300">{t('exit.explained')}</p>
      </section>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Option title={t('exit.buyTitle')} total={euro(q.buy.totalCents)}>
          {t('exit.buyText', { net: euro(q.buy.netCents), vat: euro(q.buy.vatCents) })}
        </Option>
        <Option title={t('exit.returnTitle')} total={euro(q.return.totalCents)}>
          {q.coolingOff
            ? t('exit.coolingOff')
            : t('exit.returnText', { net: euro(q.return.netCents), vat: euro(q.return.vatCents) })}
        </Option>
      </div>

      {!locked && info.unpaidCount > 0 ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <p className="mb-3">
            {t('end.unpaid', { count: info.unpaidCount, total: euro(info.unpaidCents) })}
          </p>
          <PayAllButton
            contractId={contract.id}
            label={t('invoices.payAll', { count: info.unpaidCount, total: euro(info.unpaidCents) })}
            failedLabel={t('pay.failed')}
          />
        </div>
      ) : null}

      <div className="mt-6">
        <EarlyExitButtons
          contractId={contract.id}
          actor={contract.signerName}
          buyLabel={t('exit.buyButton', { total: euro(q.buy.totalCents) })}
          returnLabel={t('exit.returnButton', { total: euro(q.return.totalCents) })}
          failedLabel={t('end.failed')}
          disabled={locked || info.unpaidCount > 0}
          doneHref={contractHref}
        />
        <p className="mt-2 text-xs text-stone-500">{t('end.buy.demo')}</p>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'font-semibold' : ''}`}>
      <dt className={strong ? '' : 'text-stone-600 dark:text-stone-400'}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Option({ title, total, children }: { title: string; total: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{total}</p>
      <p className="mt-2 text-sm text-stone-700 dark:text-stone-300">{children}</p>
    </section>
  );
}
