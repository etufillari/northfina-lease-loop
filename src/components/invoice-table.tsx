'use client';
// The contract's invoice table (the Spine's "monthly invoices generated from the locked
// contract"). Every row opens the invoice itself in a dialog: who is billed, issue and due
// date, net / VAT / total, and the demo's fake payment details.
import { useState } from 'react';
import { invoiceIssueDate, paymentReference } from '@/domain/invoicing';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT, type MessageKey, type Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export type InvoiceRow = {
  id: string;
  number: number;
  type: string;
  due_date: string;
  period_start: string | null;
  period_end: string | null;
  net_cents: number;
  vat_rate_bp: number;
  vat_cents: number;
  total_cents: number;
  state: 'paid' | 'open' | 'scheduled';
  /** Who this invoice is billed to (after a take-over not everyone's are the same). */
  billedTo: { name: string; email: string };
};

const FAKE_IBAN = 'FI21 1234 5600 0007 85';
const FAKE_BIC = 'NORDFIHH';
const PAYEE = 'Northfina Oy · 1234567-8';

export function InvoiceTable({
  locale,
  invoices,
  changedId,
}: {
  locale: Locale;
  invoices: InvoiceRow[];
  /** The invoice where the VAT banner's rate change lands (highlighted). */
  changedId: string | null;
}) {
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const [open, setOpen] = useState<InvoiceRow | null>(null);

  return (
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
          {invoices.map((invoice) => (
            <tr
              key={invoice.id}
              onClick={() => setOpen(invoice)}
              className={`cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/60 ${
                changedId === invoice.id ? 'bg-sky-50/60 dark:bg-sky-950/40' : ''
              }`}
            >
              <td className="px-4 py-2">
                <button type="button" className="font-medium underline-offset-2 hover:underline">
                  {invoice.number}
                </button>
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
              <td className="px-4 py-2 text-right font-medium">{euro(invoice.total_cents)}</td>
              <td className="px-4 py-2 text-right">
                <StateChip t={t} state={invoice.state} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {open ? <InvoiceDialog locale={locale} invoice={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function StateChip({ t, state }: { t: Translate; state: InvoiceRow['state'] }) {
  return (
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
  );
}

/** The invoice itself, as the customer would receive it (demo payment details). */
function InvoiceDialog({
  locale,
  invoice,
  onClose,
}: {
  locale: Locale;
  invoice: InvoiceRow;
  onClose: () => void;
}) {
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('invoice.title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-stone-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-lg font-semibold">
            {t('invoice.title')} #{invoice.number}
            {invoice.type !== 'lease' ? (
              <span className="ml-2 text-sm font-normal text-stone-500">
                {t(`invoice.type.${invoice.type}` as MessageKey)}
              </span>
            ) : null}
          </h3>
          <StateChip t={t} state={invoice.state} />
        </div>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{PAYEE}</p>

        <dl className="mt-4 space-y-1.5 border-t border-stone-100 pt-3 text-sm dark:border-stone-800">
          <Row label={t('invoice.billedTo')} value={invoice.billedTo.name} />
          <Row label={t('invoice.email')} value={invoice.billedTo.email} />
          <Row
            label={t('invoice.issued')}
            value={formatIsoDate(invoiceIssueDate(invoice), locale)}
          />
          <Row label={t('invoice.dueDate')} value={formatIsoDate(invoice.due_date, locale)} />
          {invoice.period_start && invoice.period_end ? (
            <Row
              label={t('invoice.period')}
              value={`${formatIsoDate(invoice.period_start, locale)} – ${formatIsoDate(invoice.period_end, locale)}`}
            />
          ) : null}
        </dl>

        <dl className="mt-3 space-y-1.5 border-t border-stone-100 pt-3 text-sm tabular-nums dark:border-stone-800">
          <Row label={t('invoice.net')} value={euro(invoice.net_cents)} />
          <Row
            label={`${t('price.vat')} ${invoice.vat_rate_bp / 100} %`}
            value={`+ ${euro(invoice.vat_cents)}`}
          />
          <Row label={t('invoice.total')} value={euro(invoice.total_cents)} bold />
        </dl>

        <div className="mt-3 rounded-xl bg-stone-50 p-3 text-sm ring-1 ring-stone-200 ring-inset dark:bg-stone-800 dark:ring-stone-700">
          <p className="text-xs font-semibold uppercase text-stone-500">{t('invoice.payment')}</p>
          <dl className="mt-1.5 space-y-1">
            <Row label="IBAN" value={FAKE_IBAN} />
            <Row label="BIC" value={FAKE_BIC} />
            <Row
              label={t('invoice.reference')}
              value={paymentReference(invoice.number * 100 + 9)}
            />
          </dl>
          <p className="mt-2 text-xs text-stone-500">{t('invoice.demoNote')}</p>
        </div>

        <div className="mt-4 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 font-medium ring-1 ring-stone-300 ring-inset hover:bg-stone-50 dark:ring-stone-700 dark:hover:bg-stone-800"
          >
            {t('invoice.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${bold ? 'font-semibold' : ''}`}>
      <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
