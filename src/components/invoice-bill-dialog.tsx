'use client';

import { useEffect, useId } from 'react';
import {
  formatInvoiceNumber,
  generateFinnishReferenceNumber,
  type MonthlyInvoice,
} from '@/domain/invoice-schedule';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export type InvoiceBillAssetInfo = {
  make: string;
  model: string;
  serial_number: string;
};

export type InvoiceBillDialogProps = {
  invoice: MonthlyInvoice;
  signedOn: string;
  termMonths: number;
  locale: Locale;
  asset?: InvoiceBillAssetInfo;
  onClose: () => void;
};

const LEASE_LOOP_COMPANY = {
  name: 'Lease Loop Oy',
  businessId: '3124567-9',
  vatId: 'FI31245679',
  street: 'Kiertotalouskatu 12',
  city: '00100 Helsinki, Finland',
  email: 'billing@leaseloop.example',
  iban: 'FI21 1234 5600 0007 85',
  bic: 'NDEAFIHH',
} as const;

export function InvoiceBillDialog({
  invoice,
  signedOn,
  termMonths,
  locale,
  asset,
  onClose,
}: InvoiceBillDialogProps) {
  const t = getT(locale);
  const intlTag = intlLocale[locale];
  const headingId = useId();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const invoiceDocNumber = formatInvoiceNumber(signedOn, invoice.invoiceNumber);
  const referenceNumber = generateFinnishReferenceNumber(signedOn, invoice.invoiceNumber);
  const formattedDueDate = formatIsoDate(invoice.dueDate, locale);
  const formattedSignedDate = formatIsoDate(signedOn, locale);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-stone-900/60 p-[16px] backdrop-blur-xs dark:bg-black/70"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="my-auto max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-[12px] border border-[#dad9d8] bg-[#FFFFFF] p-[24px] text-[#353331] shadow-sm dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100">
        {/* Top Header: Biller identity + Invoice document number */}
        <div className="flex flex-wrap items-start justify-between gap-[16px] border-b border-[#ededed] pb-[16px] dark:border-stone-800">
          <div>
            <p className="text-[0.75rem] font-semibold tracking-wider text-[#1354a5] uppercase dark:text-sky-400">
              {LEASE_LOOP_COMPANY.name}
            </p>
            <h2 id={headingId} className="mt-[4px] text-[1.75rem] leading-tight font-bold">
              {t('invoices.bill.heading')} #{invoice.invoiceNumber}
            </h2>
            <p className="mt-[4px] font-mono text-[0.875rem] text-[#615b57] dark:text-stone-400">
              {invoiceDocNumber}
            </p>
          </div>

          <span className="inline-flex items-center gap-[8px] rounded-full bg-[#f6f7f8] px-[8px] py-[4px] text-[0.75rem] font-semibold text-[#123054] ring-1 ring-[#ccd7e6] ring-inset dark:bg-stone-800 dark:text-sky-200 dark:ring-stone-700">
            <span
              aria-hidden="true"
              className="size-[8px] rounded-full bg-[#2877d7] dark:bg-sky-400"
            />
            {t('invoices.priceLockedBadge')}
          </span>
        </div>

        {/* Company info + Invoice metadata */}
        <div className="mt-[24px] grid grid-cols-1 gap-[24px] sm:grid-cols-2">
          {/* Synthetic Lease Loop Oy company block */}
          <div className="rounded-[8px] bg-[#f7f7f7] p-[16px] text-[0.875rem] dark:bg-stone-800/60 dark:ring-1 dark:ring-stone-800">
            <p className="text-[0.75rem] font-semibold tracking-wider text-[#615b57] uppercase dark:text-stone-400">
              {t('invoices.bill.billerHeading')}
            </p>
            <p className="mt-[8px] font-bold text-[#353331] dark:text-stone-100">
              {LEASE_LOOP_COMPANY.name}
            </p>
            <p className="mt-[4px] text-[#615b57] dark:text-stone-300">
              {LEASE_LOOP_COMPANY.street}
            </p>
            <p className="text-[#615b57] dark:text-stone-300">{LEASE_LOOP_COMPANY.city}</p>
            <p className="mt-[8px] text-[0.75rem] text-[#615b57] dark:text-stone-400">
              {t('invoices.bill.businessId')}:{' '}
              <span className="font-mono font-semibold text-[#353331] dark:text-stone-200">
                {LEASE_LOOP_COMPANY.businessId}
              </span>
            </p>
            <p className="text-[0.75rem] text-[#615b57] dark:text-stone-400">
              {t('invoices.bill.vatId')}:{' '}
              <span className="font-mono font-semibold text-[#353331] dark:text-stone-200">
                {LEASE_LOOP_COMPANY.vatId}
              </span>
            </p>
            <p className="mt-[4px] font-mono text-[0.75rem] text-[#615b57] dark:text-stone-400">
              {LEASE_LOOP_COMPANY.email}
            </p>
          </div>

          {/* Invoice metadata */}
          <dl className="grid gap-[8px] text-[0.875rem]">
            <BillMetaRow label={t('invoices.bill.invoiceNumber')} value={invoiceDocNumber} mono />
            <BillMetaRow label={t('invoices.bill.referenceNumber')} value={referenceNumber} mono />
            <BillMetaRow
              label={t('invoices.bill.installment')}
              value={t('invoices.bill.installmentValue', {
                current: invoice.invoiceNumber,
                total: termMonths,
              })}
              mono
            />
            <BillMetaRow
              label={t('invoices.bill.contractSignedOn')}
              value={`${formattedSignedDate} (${signedOn})`}
            />
            <BillMetaRow
              label={t('invoices.bill.dueDate')}
              value={`${formattedDueDate} (${invoice.dueDate})`}
            />
            {asset ? (
              <BillMetaRow
                label={t('invoices.bill.leasedItem')}
                value={`${asset.make} ${asset.model} (${asset.serial_number})`}
              />
            ) : null}
          </dl>
        </div>

        {/* Line-item table */}
        <div className="mt-[24px] overflow-x-auto rounded-[8px] border border-[#dad9d8] dark:border-stone-800">
          <table className="w-full border-collapse text-left text-[0.875rem]">
            <thead className="border-b border-[#dad9d8] bg-[#f7f7f7] text-[0.75rem] font-semibold text-[#615b57] uppercase dark:border-stone-800 dark:bg-stone-800 dark:text-stone-400">
              <tr>
                <th scope="col" className="px-[16px] py-[8px]">
                  {t('invoices.bill.lineDescriptionHeader')}
                </th>
                <th scope="col" className="px-[16px] py-[8px] text-right">
                  {t('invoices.tableHeaderNetRent')}
                </th>
                <th scope="col" className="px-[16px] py-[8px] text-center">
                  {t('invoices.tableHeaderVatRate')}
                </th>
                <th scope="col" className="px-[16px] py-[8px] text-right">
                  {t('invoices.tableHeaderVatAmount')}
                </th>
                <th scope="col" className="px-[16px] py-[8px] text-right">
                  {t('invoices.tableHeaderTotal')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-[#FFFFFF] dark:bg-stone-900">
              <tr>
                <td className="px-[16px] py-[16px] font-medium text-[#353331] dark:text-stone-200">
                  {t('invoices.bill.lineDescription', {
                    current: invoice.invoiceNumber,
                    total: termMonths,
                  })}
                  {asset ? (
                    <span className="mt-[4px] block text-[0.75rem] text-[#615b57] dark:text-stone-400">
                      {asset.make} {asset.model} ·{' '}
                      {t('contract.serialNumber', { serial: asset.serial_number })}
                    </span>
                  ) : null}
                </td>
                <td className="px-[16px] py-[16px] text-right font-mono text-[#353331] tabular-nums dark:text-stone-200">
                  {formatEuro(invoice.netRentCents, intlTag)}
                </td>
                <td className="px-[16px] py-[16px] text-center font-mono text-[#353331] tabular-nums dark:text-stone-200">
                  {invoice.vatRatePercent.toFixed(1)}%
                </td>
                <td className="px-[16px] py-[16px] text-right font-mono text-[#615b57] tabular-nums dark:text-stone-400">
                  {formatEuro(invoice.vatCents, intlTag)}
                </td>
                <td className="px-[16px] py-[16px] text-right font-mono font-bold text-[#123054] tabular-nums dark:text-sky-200">
                  {formatEuro(invoice.grossTotalCents, intlTag)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* VAT change explanation callout when statutory VAT changed from signing date */}
        {invoice.isVatChangedFromSigning ? (
          <div
            role="note"
            className="mt-[16px] rounded-[8px] border border-[#e9dac8] bg-[#f8f7f6] p-[16px] text-[0.875rem] text-[#5c360a] dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
          >
            {t('invoices.bill.vatChangeNote', {
              signingRate: invoice.signingVatRatePercent,
              currentRate: invoice.vatRatePercent,
              dueDate: formattedDueDate,
              netRent: formatEuro(invoice.netRentCents, intlTag),
            })}
          </div>
        ) : null}

        {/* Bank payment bar (SEPA slip) */}
        <div className="mt-[24px] rounded-[8px] border border-[#ccd7e6] bg-[#f6f7f8] p-[16px] dark:border-sky-950 dark:bg-stone-800/80">
          <p className="text-[0.75rem] font-semibold tracking-wider text-[#123054] uppercase dark:text-sky-300">
            {t('invoices.bill.paymentDetailsHeading')}
          </p>
          <div className="mt-[8px] grid grid-cols-1 gap-[16px] text-[0.875rem] sm:grid-cols-2">
            <div className="space-y-[4px]">
              <p className="text-[#615b57] dark:text-stone-400">
                {t('invoices.bill.recipient')}:{' '}
                <span className="font-semibold text-[#353331] dark:text-stone-100">
                  {LEASE_LOOP_COMPANY.name}
                </span>
              </p>
              <p className="text-[#615b57] dark:text-stone-400">
                {t('invoices.bill.iban')}:{' '}
                <span className="font-mono font-semibold text-[#353331] dark:text-stone-100">
                  {LEASE_LOOP_COMPANY.iban}
                </span>
              </p>
              <p className="text-[#615b57] dark:text-stone-400">
                {t('invoices.bill.bic')}:{' '}
                <span className="font-mono font-semibold text-[#353331] dark:text-stone-100">
                  {LEASE_LOOP_COMPANY.bic}
                </span>
              </p>
              <p className="text-[#615b57] dark:text-stone-400">
                {t('invoices.bill.referenceNumber')}:{' '}
                <span className="font-mono font-semibold text-[#353331] dark:text-stone-100">
                  {referenceNumber}
                </span>
              </p>
            </div>

            <div className="flex flex-col justify-between sm:items-end">
              <p className="text-[0.875rem] text-[#615b57] dark:text-stone-400">
                {t('invoices.bill.dueDate')}:{' '}
                <span className="font-semibold text-[#353331] dark:text-stone-100">
                  {formattedDueDate}
                </span>
              </p>
              <div className="mt-[8px] sm:text-right">
                <p className="text-[0.75rem] font-semibold text-[#123054] uppercase dark:text-sky-300">
                  {t('invoices.bill.totalToPay')}
                </p>
                <p className="font-mono text-[1.75rem] leading-none font-bold text-[#123054] tabular-nums dark:text-sky-200">
                  {formatEuro(invoice.grossTotalCents, intlTag)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-[24px] flex flex-wrap items-center justify-end gap-[8px]">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-[8px] border border-[#bfbcbb] bg-transparent px-[16px] py-[8px] text-[0.875rem] font-semibold text-[#353331] transition-colors hover:bg-[#f7f7f7] dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            {t('invoices.bill.printButton')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[8px] bg-[#1a65c1] px-[16px] py-[8px] text-[0.875rem] font-semibold text-[#FFFFFF] transition-colors hover:bg-[#1354a5] dark:bg-sky-600 dark:hover:bg-sky-500"
          >
            {t('invoices.bill.closeButton')}
          </button>
        </div>
      </div>
    </div>
  );
}

function BillMetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-[16px] border-b border-[#ededed] pb-[4px] dark:border-stone-800">
      <dt className="text-[#615b57] dark:text-stone-400">{label}</dt>
      <dd
        className={`text-right font-semibold text-[#353331] dark:text-stone-200 ${
          mono ? 'font-mono tabular-nums' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
