import Link from 'next/link';
import { formatEuro } from '@/domain/money';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT, type Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type {
  ContractViewActivity,
  ContractViewInvoice,
  CustomerContractView,
} from '@/server/contracts/contract-view';

type ContractViewProps = {
  locale: Locale;
  view: CustomerContractView;
};

const statusClasses = {
  draft:
    'bg-stone-100 text-stone-800 ring-stone-300 dark:bg-stone-800 dark:text-stone-200 dark:ring-stone-600',
  active:
    'bg-emerald-100 text-emerald-900 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-700',
  completed:
    'bg-sky-100 text-sky-900 ring-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-700',
  terminated:
    'bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-700',
} as const;

export function ContractView({ locale, view }: ContractViewProps) {
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const { contract, asset, customer } = view;
  const firstInvoice = view.invoices[0];
  const vatPreview = contract.pricingSnapshot.vatPreview;
  const firstInvoiceTotal = firstInvoice?.totalCents ?? vatPreview.monthlyGrossRentCents;
  const firstInvoiceVat = firstInvoice?.vatCents ?? vatPreview.monthlyVatCents;
  const firstInvoiceVatRate =
    firstInvoice?.vatRateBasisPoints ?? Math.round(vatPreview.ratePercent * 100);
  const totalCost = contract.pricingSnapshot.pricing.totalCostWithBuyoutCents;
  const contractNumber = `LL-${contract.id.slice(0, 8).toUpperCase()}`;
  const signedDate = contract.signedOn ?? contract.startsOn;

  return (
    <div className="bg-stone-50 dark:bg-stone-950">
      <section className="overflow-hidden bg-emerald-950 text-white">
        <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <div
            aria-hidden="true"
            className="absolute -top-24 -right-16 size-72 rounded-full bg-emerald-800/40 blur-3xl"
          />
          <div className="relative">
            <Link
              href={`/${locale}/catalogue/${asset.category}/${asset.id}`}
              className="text-sm font-medium text-emerald-200 underline-offset-4 hover:underline"
            >
              {t('contract.backToAsset')}
            </Link>
            <div className="mt-10 flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
              <div>
                <p className="text-sm font-medium tracking-wide text-emerald-200">
                  {t('contract.eyebrow')}
                </p>
                <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
                  {t('contract.greeting', { name: customer.name })}
                </h1>
                <p className="mt-4 max-w-2xl text-lg leading-8 text-emerald-100">
                  {t('contract.intro')}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
                <span
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-inset ${statusClasses[contract.status]}`}
                >
                  {t(`contract.status.${contract.status}`)}
                </span>
                <p className="text-sm text-emerald-200">
                  {t('contract.number')}: <span className="font-mono">{contractNumber}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <section aria-labelledby="contract-overview-heading">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                {t('contract.overviewEyebrow')}
              </p>
              <h2 id="contract-overview-heading" className="mt-1 text-2xl font-semibold">
                {t('contract.overviewTitle')}
              </h2>
            </div>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              {t('contract.customerEmail', { email: customer.email })}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label={t('contract.monthlyRent')}
              value={euro(firstInvoiceTotal)}
              note={t('contract.monthlyRentNote', { amount: euro(contract.monthlyNetRentCents) })}
            />
            <MetricCard
              label={t('contract.term')}
              value={t('contract.months', { count: contract.termMonths })}
              note={t('contract.termNote')}
            />
            <MetricCard
              label={t('contract.startsOn')}
              value={formatIsoDate(contract.startsOn, locale)}
              note={t('contract.signedOn', { date: formatIsoDate(signedDate, locale) })}
            />
            <MetricCard
              label={t('contract.endsOn')}
              value={formatIsoDate(contract.endsOn, locale)}
              note={t('contract.endChoiceNote')}
            />
          </div>
        </section>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <section
            aria-labelledby="price-lock-heading"
            className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950/40 sm:p-8"
          >
            <div className="flex items-start gap-4">
              <span
                aria-hidden="true"
                className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-700 text-xl text-white shadow-sm"
              >
                ✓
              </span>
              <div>
                <h2 id="price-lock-heading" className="text-xl font-semibold">
                  {t('contract.priceLockTitle')}
                </h2>
                <p className="mt-2 leading-7 text-emerald-950 dark:text-emerald-100">
                  {t('contract.priceLockBody', {
                    version: contract.priceListVersion,
                    date: formatIsoDate(signedDate, locale),
                  })}
                </p>
              </div>
            </div>
            <dl className="mt-7 grid gap-3 border-t border-emerald-200 pt-5 text-sm dark:border-emerald-900 sm:grid-cols-2">
              <DetailRow label={t('contract.listPrice')} value={euro(contract.listPriceCents)} />
              <DetailRow
                label={t('contract.downPayment')}
                value={euro(contract.downPaymentCents)}
              />
              <DetailRow
                label={t('contract.financedAmount')}
                value={euro(contract.financedAmountCents)}
              />
              <DetailRow
                label={t('contract.priceList')}
                value={t('asset.priceListVersion', { version: contract.priceListVersion })}
              />
              <DetailRow label={t('contract.buyout')} value={euro(contract.buyoutCents)} />
              <DetailRow label={t('contract.totalCost')} value={euro(totalCost)} />
            </dl>
            <p className="mt-5 text-sm leading-6 text-emerald-900 dark:text-emerald-200">
              {t('contract.vatExplanation', {
                amount: euro(firstInvoiceVat),
                rate: formatVatRate(firstInvoiceVatRate, locale),
              })}
            </p>
          </section>

          <section
            aria-labelledby="asset-heading"
            className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-8"
          >
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
              {t('contract.assetEyebrow')}
            </p>
            <h2 id="asset-heading" className="mt-1 text-2xl font-semibold">
              {asset.make} {asset.model}
            </h2>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              {t(`category.${asset.category}`)} · {asset.model_year}
            </p>
            <dl className="mt-7 grid gap-4 text-sm sm:grid-cols-2">
              <DetailRow label={t('contract.serialNumber')} value={asset.serial_number} />
              <DetailRow
                label={t('asset.usage')}
                value={t(`usage.${asset.usage.unit}`, {
                  value: formatNumber(asset.usage.value, locale),
                })}
              />
              <DetailRow label={t('condition.label')} value={t(`condition.${asset.condition}`)} />
              <DetailRow
                label={t('contract.previousLives')}
                value={formatNumber(asset.previous_lives, locale)}
              />
            </dl>
            <div className="mt-7 rounded-2xl bg-stone-100 p-4 dark:bg-stone-800">
              <p className="text-sm font-semibold">{t('contract.passportTitle')}</p>
              <p className="mt-1 text-sm leading-6 text-stone-600 dark:text-stone-300">
                {t('contract.passportBody', {
                  life: asset.previous_lives + 1,
                  serial: asset.serial_number,
                })}
              </p>
            </div>
          </section>
        </div>

        <InvoicesSection invoices={view.invoices} locale={locale} t={t} euro={euro} />

        <section aria-labelledby="end-of-term-heading" className="mt-10">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
              {t('contract.endEyebrow')}
            </p>
            <h2 id="end-of-term-heading" className="mt-1 text-2xl font-semibold">
              {t('contract.endTitle')}
            </h2>
            <p className="mt-2 text-stone-600 dark:text-stone-400">{t('contract.endIntro')}</p>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <ChoiceCard
              title={t('contract.returnTitle')}
              body={t('contract.returnBody')}
              icon="↩"
            />
            <ChoiceCard
              title={t('contract.buyTitle')}
              body={t('contract.buyBody', { amount: euro(contract.buyoutCents) })}
              icon="✓"
            />
            <ChoiceCard
              title={t('contract.passOnTitle')}
              body={t('contract.passOnBody')}
              icon="→"
            />
          </div>
          {contract.endOfTermAction ? (
            <p className="mt-4 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-200 ring-inset dark:bg-sky-950 dark:text-sky-100 dark:ring-sky-800">
              {t('contract.selectedEndAction', {
                action: t(`contract.endAction.${contract.endOfTermAction}`),
              })}
            </p>
          ) : null}
        </section>

        <ActivitySection activity={view.activity} locale={locale} t={t} />
      </main>
    </div>
  );
}

function MetricCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <p className="text-sm text-stone-600 dark:text-stone-400">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">{note}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="mt-1 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function InvoicesSection({
  invoices,
  locale,
  t,
  euro,
}: {
  invoices: ContractViewInvoice[];
  locale: Locale;
  t: Translate;
  euro: (cents: number) => string;
}) {
  return (
    <section aria-labelledby="invoices-heading" className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
            {t('contract.invoicesEyebrow')}
          </p>
          <h2 id="invoices-heading" className="mt-1 text-2xl font-semibold">
            {t('contract.invoicesTitle')}
          </h2>
        </div>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          {t('contract.invoicesIntro', { count: invoices.length })}
        </p>
      </div>

      {invoices.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed border-stone-300 p-6 text-stone-600 dark:border-stone-700 dark:text-stone-400">
          {t('contract.noInvoices')}
        </p>
      ) : (
        <div className="mt-5 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">{t('contract.invoiceTableCaption')}</caption>
              <thead className="bg-stone-100 text-xs tracking-wide text-stone-600 uppercase dark:bg-stone-800 dark:text-stone-300">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">
                    {t('contract.invoice')}
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    {t('contract.dueOn')}
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    {t('contract.invoiceNet')}
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    {t('contract.invoiceVat')}
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    {t('contract.invoiceTotal')}
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    {t('contract.invoiceStatus')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                {invoices.map((invoice) => (
                  <InvoiceRow
                    key={invoice.id ?? invoice.sequence}
                    invoice={invoice}
                    locale={locale}
                    t={t}
                    euro={euro}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function InvoiceRow({
  invoice,
  locale,
  t,
  euro,
}: {
  invoice: ContractViewInvoice;
  locale: Locale;
  t: Translate;
  euro: (cents: number) => string;
}) {
  const status = invoiceStatusFor(invoice, t);
  return (
    <tr>
      <th scope="row" className="px-5 py-4 font-medium">
        {t('contract.invoiceNumber', { number: invoice.sequence })}
        <span className="mt-1 block text-xs font-normal text-stone-500">
          {formatIsoDate(invoice.periodStart, locale)} – {formatIsoDate(invoice.periodEnd, locale)}
        </span>
      </th>
      <td className="px-5 py-4 tabular-nums">{formatIsoDate(invoice.dueOn, locale)}</td>
      <td className="px-5 py-4 tabular-nums">{euro(invoice.netRentCents)}</td>
      <td className="px-5 py-4 tabular-nums">
        {euro(invoice.vatCents)}
        <span className="mt-1 block text-xs text-stone-500">
          {formatVatRate(invoice.vatRateBasisPoints, locale)}
        </span>
      </td>
      <td className="px-5 py-4 font-semibold tabular-nums">{euro(invoice.totalCents)}</td>
      <td className="px-5 py-4">
        <span className="inline-flex rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-200">
          {status}
        </span>
      </td>
    </tr>
  );
}

function invoiceStatusFor(invoice: ContractViewInvoice, t: Translate): string {
  if (invoice.status === 'scheduled') return t('contract.invoiceScheduled');
  if (invoice.paymentStatus === 'paid') return t('contract.invoicePaid');
  if (invoice.isOverdue) return t('contract.invoiceOverdue');
  if (invoice.paymentStatus === 'partially_paid') return t('contract.invoicePartiallyPaid');
  return t('contract.invoiceIssued');
}

function ChoiceCard({ title, body, icon }: { title: string; body: string; icon: string }) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <span aria-hidden="true" className="text-2xl text-emerald-700 dark:text-emerald-400">
        {icon}
      </span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-400">{body}</p>
    </article>
  );
}

function ActivitySection({
  activity,
  locale,
  t,
}: {
  activity: ContractViewActivity[];
  locale: Locale;
  t: Translate;
}) {
  return (
    <section
      aria-labelledby="activity-heading"
      className="mt-10 border-t border-stone-200 pt-10 dark:border-stone-800"
    >
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
          {t('contract.activityEyebrow')}
        </p>
        <h2 id="activity-heading" className="mt-1 text-2xl font-semibold">
          {t('contract.activityTitle')}
        </h2>
        <p className="mt-2 text-stone-600 dark:text-stone-400">{t('contract.activityIntro')}</p>
      </div>
      {activity.length === 0 ? (
        <p className="mt-5 text-sm text-stone-600 dark:text-stone-400">
          {t('contract.noActivity')}
        </p>
      ) : (
        <ol className="mt-6 grid gap-3 md:grid-cols-2">
          {activity.map((entry) => (
            <li
              key={entry.id}
              className="flex gap-3 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
            >
              <span
                aria-hidden="true"
                className="mt-1 size-2 shrink-0 rounded-full bg-emerald-600"
              />
              <div className="min-w-0">
                <p className="font-medium">{activityTitle(entry, t)}</p>
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                  {formatIsoDate(entry.occurredOn.slice(0, 10), locale)} ·{' '}
                  {t('contract.activityBy', { actor: entry.actor })}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function activityTitle(entry: ContractViewActivity, t: Translate): string {
  if (entry.action === 'contract.signed') return t('contract.activitySigned');
  if (entry.action === 'invoices.generated') return t('contract.activityInvoices');
  if (entry.action === 'contract.end_of_term_completed') return t('contract.activityCompleted');
  if (entry.action === 'contract.early_exit_requested') return t('contract.activityEarlyExit');
  if (entry.eventType === 'lease_started') return t('contract.activityStarted');
  if (entry.eventType === 'returned') return t('contract.activityReturned');
  if (entry.eventType === 'passed_on') return t('contract.activityPassedOn');
  if (entry.eventType === 'bought_out') return t('contract.activityBoughtOut');
  if (entry.eventType === 'refurbished') return t('contract.activityRefurbished');
  if (entry.eventType === 'matched') return t('contract.activityMatched');
  return t('contract.activityUpdated');
}

function formatVatRate(basisPoints: number, locale: Locale): string {
  return `${formatNumber(basisPoints / 100, locale)} %`;
}
