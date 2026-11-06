// Every signed contract and where it stands on the app's date. There is no login in this demo,
// so this is the lessor's view of all contracts, handy for jumping back and forth in time.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { contractNumber, contractStage } from '@/domain/contract';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { appDate } from '@/server/app-date';
import { listAssets } from '@/server/assets';
import { listContracts } from '@/server/contracts';
import { db } from '@/server/db';
import { currentViewer } from '@/server/current-viewer';
import { viewerCustomerId } from '@/server/viewer';

export default async function ContractsPage({ params }: PageProps<'/[locale]/contracts'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const { today } = await appDate();
  const viewer = await currentViewer();
  // Staff see every contract; a customer sees theirs; a guest sees those made as a guest.
  const filter = viewer.kind === 'staff' ? null : { customerId: viewerCustomerId(viewer) };
  const [contracts, assets] = await Promise.all([listContracts(db, filter, today), listAssets(db)]);
  const assetName = new Map(assets.map((a) => [a.id, `${a.make} ${a.model}`]));
  const date = (iso: string) => formatIsoDate(iso, locale);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('contracts.title')}</h1>
      <p className="mt-3 max-w-2xl text-lg text-stone-700 dark:text-stone-300">
        {viewer.kind === 'customer'
          ? t('contracts.showingCustomer', { name: viewer.customer.name })
          : t(`contracts.showing.${viewer.kind}`)}{' '}
        {t('contracts.intro')}
      </p>

      {contracts.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {t('contracts.empty')}
        </p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {contracts.map((contract) => {
            const stage =
              contract.status !== 'active'
                ? (contract.status as 'returned' | 'bought' | 'passed_on')
                : contractStage(contract, today);
            return (
              <li key={contract.id}>
                <article className="relative h-full rounded-2xl border border-stone-200 bg-white p-5 shadow-sm hover:border-emerald-300 dark:border-stone-800 dark:bg-stone-900">
                  <p className="font-mono text-xs text-stone-500">{contractNumber(contract.id)}</p>
                  <h2 className="mt-1 font-semibold">
                    <Link
                      href={`/${locale}/contracts/${contract.id}`}
                      className="after:absolute after:inset-0 after:rounded-2xl"
                    >
                      {assetName.get(contract.assetId) ?? contract.assetId}
                    </Link>
                  </h2>
                  <p className="text-sm text-stone-600 dark:text-stone-400">
                    {contract.customerName}
                  </p>
                  <p className="mt-3 text-sm">
                    {date(contract.startDate)} – {date(contract.endDate)}
                  </p>
                  <p className="mt-1 text-sm tabular-nums">
                    {t('contracts.monthly', {
                      amount: formatEuro(contract.monthlyNetCents, intlLocale[locale]),
                    })}
                  </p>
                  <p className="mt-3 inline-block rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium dark:bg-stone-800">
                    {t(`contracts.stage.${stage}`)}
                  </p>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
