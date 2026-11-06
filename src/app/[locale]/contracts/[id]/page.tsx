// Spine steps 4–6: the locked contract, every invoice (with the VAT-change banner), and
// the during-contract actions (early exit, buy-at-end opt-in, end-of-term buy or return).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { cookies } from 'next/headers';
import { ContractActions } from '@/components/contract-actions';
import { customerPersona, PERSONA_COOKIE } from '@/components/persona-cookie';
import { loadVatRates } from '@/data/load';
import { buyoutInvoicePreview } from '@/domain/buyout';
import { addMonthsClamped } from '@/domain/calendar';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { asOfFromPage } from '@/server/as-of';
import { getContract } from '@/server/contracts';
import { db } from '@/server/db';
import { termEndsOn } from '@/server/lifecycle';

export default async function ContractPage({
  params,
  searchParams,
}: PageProps<'/[locale]/contracts/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const contract = await getContract(db, id);
  if (!contract) notFound();

  const { asOf, asOfParam } = await asOfFromPage(await searchParams);
  const persona = customerPersona((await cookies()).get(PERSONA_COOKIE)?.value);
  const endsOn = termEndsOn(contract);
  // Consumers see prices with VAT, businesses net (docs/DECISIONS.md, VAT).
  const holder = await db.customer.findUnique({
    where: { id: contract.customer_id },
    select: { type: true },
  });
  const pricesInclVat = holder?.type === 'consumer';
  const leasedAssets = await db.asset.findMany({
    where: { id: { in: contract.assets.map((a) => a.asset_id) } },
    select: { id: true, make: true, model: true },
    orderBy: { id: 'asc' },
  });
  const vatRates = await loadVatRates();
  const buyout = buyoutInvoicePreview(
    { buyoutNetCents: contract.buyout_net_cents, termEndsOn: endsOn, asOf },
    vatRates
  );

  // The first invoice whose VAT rate differs from the previous one gets the banner. The
  // banner names the STATUTORY change date from the rate table, not the invoice's due date.
  const leaseInvoices = contract.invoices.filter((invoice) => invoice.type === 'lease');
  const changeIndex = leaseInvoices.findIndex(
    (invoice, index) => index > 0 && invoice.vat_rate_bp !== leaseInvoices[index - 1]!.vat_rate_bp
  );
  const change = changeIndex > 0 ? leaseInvoices[changeIndex]! : null;
  const before = changeIndex > 0 ? leaseInvoices[changeIndex - 1]! : null;
  const changeLawDate =
    change &&
    (vatRates.rates.find((rate) => Math.round(rate.rate_percent * 100) === change.vat_rate_bp)
      ?.valid_from ??
      change.due_date);

  // An invoice is open from its due date until the next one is due (a month later), then
  // counts as paid — including the last one, which otherwise would stay open forever.
  const invoiceState = (dueDate: string): 'paid' | 'open' | 'scheduled' => {
    if (dueDate > asOf) return 'scheduled';
    const latestDue = [...contract.invoices].filter((i) => i.due_date <= asOf).at(-1);
    const stillOpen = latestDue?.due_date === dueDate && asOf < addMonthsClamped(dueDate, 1);
    return stillOpen ? 'open' : 'paid';
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link
        href={`/${locale}/me${asOfParam ? `?asOf=${asOfParam}` : ''}`}
        className="text-sm text-emerald-800 hover:underline dark:text-emerald-300"
      >
        ← {t('me.title')}
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t('contract.title')}</h1>
        <span className="rounded-full bg-stone-100 px-3 py-1 text-sm font-medium ring-1 ring-stone-200 ring-inset dark:bg-stone-800 dark:ring-stone-700">
          {t(`contract.status.${contract.status}` as MessageKey)}
        </span>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <Fact label={t('price.netRent')} value={euro(contract.monthly_net_rent_cents)} />
        <Fact
          label={t('contract.term')}
          value={t('price.months', { months: contract.term_months })}
        />
        <Fact label={t('contract.startDate')} value={formatIsoDate(contract.start_date, locale)} />
        <Fact label={t('contract.endsOn')} value={formatIsoDate(endsOn, locale)} />
        <Fact label={t('price.financed')} value={euro(contract.financed_cents)} />
        <Fact label={t('price.totalCost')} value={euro(contract.net_total_cents)} />
        <Fact label={t('price.buyout')} value={euro(contract.buyout_net_cents)} />
        <Fact
          label={t('contract.product')}
          value={leasedAssets.map((a) => `${a.make} ${a.model} (${a.id})`).join(', ')}
        />
      </dl>

      {contract.status === 'active' && persona ? (
        <ContractActions
          locale={locale}
          contractId={contract.id}
          personaId={persona}
          asOf={asOf}
          endsOn={endsOn}
          today={asOf}
          buyoutInvoice={buyout.ok ? buyout.preview : null}
          pricesInclVat={pricesInclVat}
          purchaseAtEnd={contract.purchase_at_end}
          termMonthsTotal={contract.term_months}
        />
      ) : null}

      <section className="mt-8">
        <h2 className="text-xl font-semibold">{t('contract.invoices')}</h2>
        {change && before ? (
          <p className="mt-3 rounded-xl bg-sky-50 p-4 text-sm text-sky-900 ring-1 ring-sky-200 ring-inset dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800">
            {t('contract.vatBanner', {
              net: euro(contract.monthly_net_rent_cents),
              from: before.vat_rate_bp / 100,
              to: change.vat_rate_bp / 100,
              date: formatIsoDate(changeLawDate || change.due_date, locale),
              diff: euro(change.total_cents - before.total_cents),
            })}
          </p>
        ) : null}
        <div className="mt-4 overflow-x-auto rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
          <table className="w-full text-sm tabular-nums">
            <thead className="border-b border-stone-200 text-left text-xs text-stone-600 uppercase dark:border-stone-800 dark:text-stone-400">
              <tr>
                <th className="px-4 py-2.5">{t('invoice.number')}</th>
                <th className="px-4 py-2.5">{t('invoice.dueDate')}</th>
                <th className="px-4 py-2.5">{t('invoice.period')}</th>
                <th className="px-4 py-2.5 text-right">{t('invoice.net')}</th>
                <th className="px-4 py-2.5 text-right">{t('price.vat')} %</th>
                <th className="px-4 py-2.5 text-right">{t('price.vat')}</th>
                <th className="px-4 py-2.5 text-right">{t('invoice.total')}</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {contract.invoices.map((invoice) => {
                const state = invoiceState(invoice.due_date);
                const changedHere = change?.id === invoice.id;
                return (
                  <tr
                    key={invoice.id}
                    className={changedHere ? 'bg-sky-50/60 dark:bg-sky-950/40' : ''}
                  >
                    <td className="px-4 py-2">
                      {invoice.number}
                      {invoice.type !== 'lease' ? (
                        <span className="ml-1 text-xs text-stone-500">
                          {t(`invoice.type.${invoice.type}` as MessageKey)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">{formatIsoDate(invoice.due_date, locale)}</td>
                    <td className="px-4 py-2 text-stone-600 dark:text-stone-400">
                      {invoice.period_start && invoice.period_end
                        ? `${formatIsoDate(invoice.period_start, locale)} – ${formatIsoDate(invoice.period_end, locale)}`
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-right">{euro(invoice.net_cents)}</td>
                    <td className="px-4 py-2 text-right">{invoice.vat_rate_bp / 100}</td>
                    <td className="px-4 py-2 text-right">{euro(invoice.vat_cents)}</td>
                    <td className="px-4 py-2 text-right font-medium">
                      {euro(invoice.total_cents)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${
                          state === 'open'
                            ? 'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800'
                            : state === 'paid'
                              ? 'bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800'
                              : 'bg-stone-100 text-stone-600 ring-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:ring-stone-700'
                        }`}
                      >
                        {t(`invoice.state.${state}` as MessageKey)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
