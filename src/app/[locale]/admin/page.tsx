// Admin: a control room for demonstrations. Totals and the fleet's CO₂ saving on the app's
// date, VAT changes on the fly, every contract, and the latest audit log entries. Having the
// page open is enough: like the rest of this demo there is no real login.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { SoldItemsPanel } from '@/components/sold-items-panel';
import { VatAdmin } from '@/components/vat-admin';
import { contractNumber, contractStage } from '@/domain/contract';
import { formatEuro } from '@/domain/money';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { adminOverview } from '@/server/admin';
import { appDate } from '@/server/app-date';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';
import { effectiveVatRates, listVatChanges } from '@/server/vat';

export default async function AdminPage({ params }: PageProps<'/[locale]/admin'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const { today } = await appDate();
  const [overview, rates, changes, assets] = await Promise.all([
    adminOverview(db, today),
    effectiveVatRates(db),
    listVatChanges(db),
    listAssets(db),
  ]);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const assetName = new Map(assets.map((a) => [a.id, `${a.make} ${a.model}`]));
  const adminIdByDate = new Map(changes.map((c) => [c.validFrom, c.id]));
  const { contracts, applications, invoices } = overview;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('admin.title')}</h1>
      <p className="mt-3 max-w-3xl text-lg text-stone-700 dark:text-stone-300">
        {t('admin.intro', { date: formatIsoDate(today, locale) })}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label={t('admin.tile.contracts')}
          value={String(contracts.total)}
          detail={t('admin.tile.contractsDetail', {
            active: contracts.active,
            ended: contracts.ended,
            closed: contracts.returned + contracts.bought + contracts.passed_on,
          })}
        />
        <Tile
          label={t('admin.tile.applications')}
          value={String(applications.total)}
          detail={t('admin.tile.applicationsDetail', {
            approved: applications.approved,
            review: applications.manual_review,
            rejected: applications.rejected,
          })}
        />
        <Tile
          label={t('admin.tile.due')}
          value={euro(invoices.dueCents)}
          detail={t('admin.tile.count', { count: invoices.dueCount })}
        />
        <Tile
          label={t('admin.tile.paid')}
          value={euro(invoices.paidCents)}
          detail={t('admin.tile.count', { count: invoices.paidCount })}
        />
      </div>
      <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
        {t('admin.items', {
          available: overview.assets.available,
          leased: overview.assets.leased,
          reserved: overview.assets.reserved,
          returned: overview.assets.returned,
          sold: overview.assets.sold,
        })}
      </p>

      <Panel title={t('co2.fleetTitle')}>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-stone-600 dark:text-stone-400">{t('co2.reuseSaved')}</dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {t('co2.kg', { kg: formatNumber(overview.impact.reuseSavedKg, locale) })}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-stone-600 dark:text-stone-400">{t('co2.moneySaved')}</dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {euro(overview.impact.moneySavedCents)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-stone-600 dark:text-stone-400">{t('co2.ridingSaved')}</dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {t('co2.kg', { kg: formatNumber(overview.impact.ridingSavedKg, locale) })}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
          {t('co2.fleetDetail', {
            items: overview.impact.itemsReused,
            lives: overview.impact.reuseLives,
          })}
        </p>
      </Panel>

      <Panel title={t('secondLife.title')}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-stone-700 dark:text-stone-300">
            {t('admin.secondLifeWaiting', { count: overview.assets.returned })}
          </p>
          <Link
            href={`/${locale}/admin/second-life`}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            {t('admin.secondLifeOpen')}
          </Link>
        </div>
      </Panel>

      <SoldItemsPanel sold={overview.sold} locale={locale} t={t} />

      <Panel title={t('admin.vat.title')}>
        <VatAdmin
          rates={rates.rates.map((rate) => ({
            validFrom: rate.valid_from,
            validTo: rate.valid_to,
            ratePercent: rate.rate_percent,
            adminId: adminIdByDate.get(rate.valid_from) ?? null,
          }))}
          today={today}
          locale={locale}
        />
      </Panel>

      <Panel title={t('admin.contracts')}>
        {overview.allContracts.length === 0 ? (
          <p className="text-stone-600 dark:text-stone-400">{t('contracts.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-left text-stone-600 dark:text-stone-400">
                <tr className="border-b border-stone-200 dark:border-stone-700">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {t('contract.number')}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {t('apply.item')}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {t('contract.lessee')}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {t('contract.period')}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    {t('contract.monthlyLocked')}
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    {t('invoices.status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {overview.allContracts.map((contract) => {
                  const stage =
                    contract.status !== 'active'
                      ? (contract.status as 'returned' | 'bought' | 'passed_on')
                      : contractStage(contract, today);
                  return (
                    <tr
                      key={contract.id}
                      className="border-b border-stone-100 dark:border-stone-800"
                    >
                      <td className="py-1.5 pr-3 font-mono">
                        <Link
                          href={`/${locale}/contracts/${contract.id}`}
                          className="text-emerald-800 underline dark:text-emerald-300"
                        >
                          {contractNumber(contract.id)}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-3">
                        {assetName.get(contract.assetId) ?? contract.assetId}
                      </td>
                      <td className="py-1.5 pr-3">{contract.customerName}</td>
                      <td className="py-1.5 pr-3">
                        {formatIsoDate(contract.startDate, locale)} –{' '}
                        {formatIsoDate(contract.endDate, locale)}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {euro(contract.monthlyNetCents)}
                      </td>
                      <td className="py-1.5">{t(`contracts.stage.${stage}`)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title={t('admin.audit')}>
        {overview.audit.length === 0 ? (
          <p className="text-stone-600 dark:text-stone-400">{t('admin.auditEmpty')}</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {overview.audit.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap gap-x-3 border-b border-stone-100 pb-2 dark:border-stone-800"
              >
                <time
                  dateTime={entry.createdAt}
                  className="text-stone-600 dark:text-stone-400 tabular-nums"
                >
                  {new Intl.DateTimeFormat(intlLocale[locale], {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: 'Europe/Helsinki',
                  }).format(new Date(entry.createdAt))}
                </time>
                <span className="font-mono font-medium">{entry.action}</span>
                <span className="text-stone-700 dark:text-stone-300">{entry.actor}</span>
                <span className="font-mono text-xs text-stone-600 dark:text-stone-400">
                  {entry.entity}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-xs text-stone-600 dark:text-stone-400">{t('admin.auditNote')}</p>
      </Panel>
    </div>
  );
}

function Tile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <p className="text-sm text-stone-600 dark:text-stone-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">{detail}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
