import type { VatRates } from '@/data/schemas';
import { GrossTotals } from './gross-totals';
import type { ContractView } from '@/server/spine-views';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { buttonClass, messageFor, MoneyFacts, panelClass } from './ui';

type Invoice = ContractView['invoices'][number];
type Forecast = ContractView['forecast'][number];

function InvoiceTable({ rows, locale }: { rows: readonly (Invoice | Forecast)[]; locale: Locale }) {
  const money = (value: number) => formatEuro(value, intlLocale[locale]);
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm tabular-nums">
        <thead>
          <tr>
            {['period', 'scheduled', 'invoiceDate', 'due', 'net', 'vat', 'gross'].map((key) => (
              <th key={key} scope="col" className="border-b border-stone-300 p-2">
                {messageFor(locale, 'spine.' + key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={'id' in row ? row.id : row.period}>
              <th scope="row" className="border-b border-stone-200 p-2 font-normal">
                {'kind' in row && row.kind !== 'rent'
                  ? messageFor(
                      locale,
                      row.kind === 'buyout' ? 'spine.buyoutInvoice' : 'spine.down_payment'
                    )
                  : row.period || index + 1}
              </th>
              <td className="border-b border-stone-200 p-2">
                {'scheduledFor' in row ? row.scheduledFor : row.invoiceDate}
              </td>
              <td className="border-b border-stone-200 p-2">{row.invoiceDate}</td>
              <td className="border-b border-stone-200 p-2">{row.dueDate}</td>
              <td className="border-b border-stone-200 p-2">{money(row.netCents)}</td>
              <td className="border-b border-stone-200 p-2">
                {money(row.vatCents)} ({row.vatBasisPoints / 100}%)
              </td>
              <td className="border-b border-stone-200 p-2">{money(row.grossCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ContractPanel({
  contract,
  locale,
  busy,
  onIssue,
  onDate,
  vatRates,
}: {
  contract: ContractView;
  vatRates: VatRates;
  locale: Locale;
  busy: boolean;
  onIssue: () => void;
  onDate: (date: string) => void;
}) {
  const t = getT(locale);
  return (
    <section className={panelClass} aria-labelledby="agreement-heading">
      <h2 id="agreement-heading" className="text-xl font-semibold">
        {t('spine.contract')}
      </h2>
      <p className="mt-2 break-all">
        {t('spine.contractId')}: {contract.id}
      </p>
      <p>
        {t('spine.life', { count: contract.lifeNumber })} ·{' '}
        {messageFor(locale, 'spine.' + contract.status)}
      </p>
      <p>
        {t('spine.signed', { date: contract.signedOn })} ·{' '}
        {t('spine.endDate', { date: contract.endDate })}
      </p>
      <div className="mt-5">
        <MoneyFacts terms={contract.terms} locale={locale} />
        <p className="mt-3 text-sm">
          {t('spine.savedOffer', { date: contract.pricedOn, source: contract.priceSource })}
        </p>
        <GrossTotals
          terms={contract.terms}
          startDate={contract.startDate}
          upfrontDate={contract.signedOn}
          vatRates={vatRates}
          issued={contract.invoices}
          locale={locale}
        />
      </div>
      <p className="mt-4 text-sm">{t('spine.taxHelp')}</p>
      <h3 id="invoices-heading" tabIndex={-1} className="mt-8 scroll-mt-24 text-lg font-semibold">
        {t('spine.invoices')}
      </h3>
      <p className="mt-2 text-sm">{t('spine.issuedHelp')}</p>
      {contract.invoices.length ? (
        <InvoiceTable rows={contract.invoices} locale={locale} />
      ) : (
        <p className="mt-3">{t('spine.noneIssued')}</p>
      )}
      {contract.status === 'active' ? (
        <div className="mt-5 flex flex-wrap gap-3">
          <button className={buttonClass} disabled={busy} onClick={onIssue}>
            {t('spine.issue')}
          </button>
          {contract.nextScheduledDate ? (
            <button
              className={buttonClass}
              disabled={busy}
              onClick={() => onDate(contract.nextScheduledDate!)}
            >
              {t('spine.nextDate')}
            </button>
          ) : null}
        </div>
      ) : null}
      <details className="mt-6">
        <summary className="cursor-pointer font-medium">{t('spine.forecast')}</summary>
        <p className="mt-3 text-sm">{t('spine.forecastHelp')}</p>
        {contract.forecastAvailable ? (
          <InvoiceTable rows={contract.forecast} locale={locale} />
        ) : (
          <p>{t('spine.error')}</p>
        )}
      </details>
    </section>
  );
}
