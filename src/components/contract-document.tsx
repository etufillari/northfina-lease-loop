// The lease contract as a document. The same component shows the unsigned draft (before
// signing) and the signed contract, so what the customer reads is exactly what they sign.
// Styled to print cleanly: the site header, footer and buttons are hidden in print.
import type { ReactNode } from 'react';
import type { Asset } from '@/data/schemas';
import { formatEuro, percentOfCents } from '@/domain/money';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { messages, type MessageKey, type Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

/** Everything the document shows. Prices are the locked ones, copied from the application. */
export type ContractView = {
  number: string | null;
  customerType: string;
  customerName: string;
  customerEmail: string | null;
  businessId: string | null;
  startDate: string;
  endDate: string;
  termMonths: number;
  quoteDate: string;
  priceListVersion: number;
  listPriceCents: number;
  downPaymentCents: number;
  financedCents: number;
  monthlyNetCents: number;
  buyoutCents: number;
  signedDate: string | null;
  signerName: string | null;
};

type ContractDocumentProps = {
  view: ContractView;
  asset: Asset;
  /** VAT rate today, to show an example invoice total. Not part of the locked price. */
  vatPercentToday: number | null;
  /** Today's list price, when a newer price list prices the item differently. */
  todaysPrice: { priceCents: number; priceListVersion: number } | null;
  locale: Locale;
  t: Translate;
};

export function ContractDocument(props: ContractDocumentProps) {
  const { view, asset, vatPercentToday, todaysPrice, locale, t } = props;
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const date = (iso: string) => formatIsoDate(iso, locale);
  const typeKey = `answer.${view.customerType}`;
  const customerType = typeKey in messages.en ? t(typeKey as MessageKey) : view.customerType;
  const vatToday =
    vatPercentToday === null ? null : percentOfCents(view.monthlyNetCents, vatPercentToday);

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-10 dark:border-stone-800 dark:bg-stone-900 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-6 dark:border-stone-800">
        <div>
          <p className="text-sm text-stone-600 dark:text-stone-400">{t('brand.name')}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('contract.title')}
          </h1>
        </div>
        <p className="text-right text-sm">
          {view.number ? (
            <>
              <span className="block text-stone-600 dark:text-stone-400">
                {t('contract.number')}
              </span>
              <span className="font-mono font-semibold">{view.number}</span>
            </>
          ) : (
            <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100">
              {t('contract.draft')}
            </span>
          )}
        </p>
      </header>

      <Section title={t('contract.parties')}>
        <Row label={t('contract.lessor')} value={t('brand.name')} />
        <Row label={t('contract.lessee')} value={`${view.customerName} (${customerType})`} />
        {view.businessId ? <Row label={t('contract.businessId')} value={view.businessId} /> : null}
        {view.customerEmail ? <Row label={t('contract.email')} value={view.customerEmail} /> : null}
      </Section>

      <Section title={t('contract.item')}>
        <Row label={t('apply.item')} value={`${asset.make} ${asset.model}`} />
        <Row label={t('asset.serialNumber')} value={asset.serial_number} />
        <Row label={t('asset.id')} value={asset.id} />
        <Row label={t('condition.label')} value={t(`condition.${asset.condition}`)} />
        <Row
          label={t('asset.usage')}
          value={t(`usage.${asset.usage.unit}`, { value: formatNumber(asset.usage.value, locale) })}
        />
      </Section>

      <Section title={t('contract.period')}>
        <Row label={t('apply.term')} value={t('apply.termValue', { months: view.termMonths })} />
        <Row label={t('contract.startDate')} value={date(view.startDate)} />
        <Row label={t('contract.endDate')} value={date(view.endDate)} />
      </Section>

      <Section title={t('contract.price')}>
        <Row label={t('price.listPrice')} value={euro(view.listPriceCents)} />
        <Row label={t('price.downPayment')} value={euro(view.downPaymentCents)} />
        <Row label={t('price.financed')} value={euro(view.financedCents)} />
        <Row label={t('contract.monthlyLocked')} value={euro(view.monthlyNetCents)} strong />
        <Row
          label={t('contract.totalRents')}
          value={t('price.paymentsValue', {
            count: view.termMonths,
            amount: euro(view.monthlyNetCents),
            total: euro(view.monthlyNetCents * view.termMonths),
          })}
        />
        <Row label={t('contract.buyout')} value={euro(view.buyoutCents)} />
        <p className="mt-3 text-sm text-stone-700 dark:text-stone-300">
          {vatToday === null || vatPercentToday === null
            ? t('contract.vatRule')
            : t('contract.vatExample', {
                percent: formatNumber(vatPercentToday, locale),
                vat: euro(vatToday),
                total: euro(view.monthlyNetCents + vatToday),
              })}
        </p>
      </Section>

      <Section title={t('contract.priceLock')}>
        <p className="text-sm text-stone-700 dark:text-stone-300">
          {t('contract.priceLockText', {
            version: view.priceListVersion,
            date: date(view.quoteDate),
          })}
        </p>
        {todaysPrice ? (
          <p className="mt-2 rounded-lg bg-stone-100 p-3 text-sm dark:bg-stone-800 print:bg-transparent print:p-0">
            {t('contract.priceLockToday', {
              version: todaysPrice.priceListVersion,
              price: euro(todaysPrice.priceCents),
              locked: euro(view.listPriceCents),
            })}
          </p>
        ) : null}
      </Section>

      <Section title={t('contract.endOfTerm')}>
        <p className="text-sm text-stone-700 dark:text-stone-300">
          {t('contract.endOfTermText', { buyout: euro(view.buyoutCents) })}
        </p>
      </Section>

      <Section title={t('contract.signature')}>
        <p className="text-sm">
          {view.signedDate && view.signerName
            ? t('contract.signedBy', { name: view.signerName, date: date(view.signedDate) })
            : t('contract.notSigned')}
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h2 className="text-sm font-semibold tracking-wide text-stone-600 uppercase dark:text-stone-400">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-stone-100 py-1.5 text-sm dark:border-stone-800">
      <span className="text-stone-600 dark:text-stone-400">{label}</span>
      <span className={`text-right tabular-nums ${strong ? 'font-semibold' : 'font-medium'}`}>
        {value}
      </span>
    </div>
  );
}
