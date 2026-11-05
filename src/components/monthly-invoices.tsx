'use client';

import { useId, useState } from 'react';
import type { VatRates } from '@/data/schemas';
import {
  generateInvoiceSchedule,
  type InvoiceSchedule,
  type MonthlyInvoice,
} from '@/domain/invoice-schedule';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { InvoiceBillDialog, type InvoiceBillAssetInfo } from './invoice-bill-dialog';

export type MonthlyInvoicesProps = {
  /** Contract signing / start date in ISO YYYY-MM-DD */
  signedOn: string;
  /** Term length in months (e.g. 12, 24, 36, 48) */
  termMonths: number;
  /** Agreed locked net monthly rent in euro cents */
  monthlyNetRentCents: number;
  /** VAT rates repository */
  vatRates: VatRates;
  /** Current display locale */
  locale: Locale;
  /** Optional leased asset metadata displayed on opened invoice bills */
  asset?: InvoiceBillAssetInfo;
  /** Initial state for whether all invoices are expanded (default: false = first 3 invoices) */
  initialExpanded?: boolean;
  /** Optional custom title override */
  title?: string;
  /** Optional pre-computed schedule */
  schedule?: InvoiceSchedule;
};

/**
 * MonthlyInvoices component
 *
 * Displays the monthly invoice schedule generated from a locked lease contract.
 *
 * Implements:
 * - Smart Problem 1 ("Lock the price, not the tax"): Net rent is locked,
 *   while VAT reflects the rate on each invoice date, badging VAT changes (e.g. Jan 2027 26.0%).
 * - Scenario Card 1: Defaults to displaying the first 3 invoices with an expand toggle.
 * - Calendar traps (Scenario Card 4): Shows accurate due dates with month-end clamping.
 * - Design tokens: Card styling, semantic badges, accessible table markup.
 */
export function MonthlyInvoices({
  signedOn,
  termMonths,
  monthlyNetRentCents,
  vatRates,
  locale,
  asset,
  initialExpanded = false,
  title,
  schedule: externalSchedule,
}: MonthlyInvoicesProps) {
  const t = getT(locale);
  const intlTag = intlLocale[locale];
  const headingId = useId();
  const [isExpanded, setIsExpanded] = useState<boolean>(initialExpanded);
  const [selectedInvoice, setSelectedInvoice] = useState<MonthlyInvoice | null>(null);

  const schedule =
    externalSchedule ??
    generateInvoiceSchedule({
      signedOn,
      termMonths,
      monthlyNetRentCents,
      vatRates,
    });

  const visibleInvoices: MonthlyInvoice[] =
    isExpanded || schedule.invoices.length <= 3 ? schedule.invoices : schedule.invoices.slice(0, 3);

  const canToggle = schedule.invoices.length > 3;

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-[12px] border border-[#dad9d8] bg-[#FFFFFF] p-[24px] text-[#353331] shadow-sm dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-[16px] border-b border-[#ededed] pb-[16px] dark:border-stone-800">
        <div>
          <p className="text-[0.75rem] font-semibold tracking-wider text-[#1354a5] uppercase dark:text-sky-400">
            {t('invoices.eyebrow')}
          </p>
          <h2 id={headingId} className="mt-[4px] text-[1.375rem] leading-tight font-bold">
            {title ?? t('invoices.title')}
          </h2>
          <p className="mt-[4px] text-[0.875rem] text-[#615b57] dark:text-stone-400">
            {t('invoices.intro', {
              netRent: formatEuro(schedule.monthlyNetRentCents, intlTag),
            })}
          </p>
        </div>

        <span className="inline-flex items-center gap-[8px] rounded-full bg-[#f6f7f8] px-[12px] py-[4px] text-[0.75rem] font-semibold text-[#123054] ring-1 ring-[#ccd7e6] ring-inset dark:bg-stone-800 dark:text-sky-200 dark:ring-stone-700">
          <span
            aria-hidden="true"
            className="size-[8px] rounded-full bg-[#2877d7] dark:bg-sky-400"
          />
          {t('invoices.priceLockedBadge')}
        </span>
      </div>

      {/* Schedule Summary Banner */}
      <div className="my-[20px] grid grid-cols-1 gap-[16px] rounded-[8px] border border-[#ccd7e6] bg-[#f6f7f8] p-[16px] sm:grid-cols-3 dark:border-sky-950 dark:bg-stone-800/80">
        <div>
          <p className="text-[0.75rem] font-medium text-[#615b57] dark:text-stone-400">
            {t('invoices.summaryTotalNet')}
          </p>
          <p className="mt-[2px] font-mono text-[1.125rem] font-bold text-[#123054] tabular-nums dark:text-sky-200">
            {formatEuro(schedule.totalNetRentCents, intlTag)}
          </p>
          <p className="text-[0.75rem] text-[#615b57] dark:text-stone-400">
            {schedule.termMonths} × {formatEuro(schedule.monthlyNetRentCents, intlTag)}
          </p>
        </div>

        <div>
          <p className="text-[0.75rem] font-medium text-[#615b57] dark:text-stone-400">
            {t('invoices.summaryTotalVat')}
          </p>
          <p className="mt-[2px] font-mono text-[1.125rem] font-bold text-[#123054] tabular-nums dark:text-sky-200">
            {formatEuro(schedule.totalVatCents, intlTag)}
          </p>
          <p className="text-[0.75rem] text-[#615b57] dark:text-stone-400">
            {schedule.signingVatRatePercent}%
            {(() => {
              const changedRates = Array.from(
                new Set(
                  schedule.invoices
                    .filter((inv) => inv.isVatChangedFromSigning)
                    .map((inv) => `${inv.vatRatePercent}%`)
                )
              );
              return changedRates.length > 0 ? ` → ${changedRates.join(', ')}` : '';
            })()}
          </p>
        </div>

        <div>
          <p className="text-[0.75rem] font-medium text-[#615b57] dark:text-stone-400">
            {t('invoices.summaryTotalGross')}
          </p>
          <p className="mt-[2px] font-mono text-[1.125rem] font-bold text-[#123054] tabular-nums dark:text-sky-200">
            {formatEuro(schedule.totalGrossCents, intlTag)}
          </p>
          <p className="text-[0.75rem] text-[#615b57] dark:text-stone-400">
            {t('invoices.summaryTotalInvoiced', { months: schedule.termMonths })}
          </p>
        </div>
      </div>

      {/* Invoice Table */}
      <div className="overflow-x-auto rounded-[8px] border border-[#dad9d8] dark:border-stone-800">
        <table className="w-full border-collapse text-left text-[0.875rem]">
          <thead className="border-b border-[#dad9d8] bg-[#f7f7f7] text-[0.75rem] font-semibold text-[#615b57] uppercase dark:border-stone-800 dark:bg-stone-800 dark:text-stone-400">
            <tr>
              <th scope="col" className="px-[16px] py-[10px]">
                {t('invoices.tableHeaderNumber')}
              </th>
              <th scope="col" className="px-[16px] py-[10px]">
                {t('invoices.tableHeaderDueDate')}
              </th>
              <th scope="col" className="px-[16px] py-[10px] text-right">
                {t('invoices.tableHeaderNetRent')}
              </th>
              <th scope="col" className="px-[16px] py-[10px] text-center">
                {t('invoices.tableHeaderVatRate')}
              </th>
              <th scope="col" className="px-[16px] py-[10px] text-right">
                {t('invoices.tableHeaderVatAmount')}
              </th>
              <th scope="col" className="px-[16px] py-[10px] text-right">
                {t('invoices.tableHeaderTotal')}
              </th>
              <th scope="col" className="px-[16px] py-[10px] text-right">
                {t('invoices.tableHeaderAction')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ededed] bg-[#FFFFFF] dark:divide-stone-800 dark:bg-stone-900">
            {visibleInvoices.map((inv) => (
              <tr
                key={inv.invoiceNumber}
                onClick={() => setSelectedInvoice(inv)}
                className={`cursor-pointer transition-colors hover:bg-[#f7f7f7] dark:hover:bg-stone-800/60 ${
                  inv.isVatChangedFromSigning ? 'bg-[#f8f7f6] dark:bg-amber-950/20' : ''
                }`}
              >
                <td className="px-[16px] py-[12px] font-mono font-medium text-[#353331] dark:text-stone-200">
                  #{inv.invoiceNumber}
                </td>
                <td className="px-[16px] py-[12px] whitespace-nowrap text-[#353331] dark:text-stone-200">
                  <div>
                    <span className="font-medium">{formatIsoDate(inv.dueDate, locale)}</span>
                    <span className="ml-[8px] font-mono text-[0.75rem] text-[#615b57] dark:text-stone-400">
                      ({inv.dueDate})
                    </span>
                  </div>
                </td>
                <td className="px-[16px] py-[12px] text-right font-mono text-[#353331] tabular-nums dark:text-stone-200">
                  {formatEuro(inv.netRentCents, intlTag)}
                </td>
                <td className="px-[16px] py-[12px] text-center">
                  <div className="inline-flex flex-col items-center gap-[2px]">
                    <span className="font-mono text-[0.875rem] font-medium text-[#353331] dark:text-stone-200">
                      {inv.vatRatePercent.toFixed(1)}%
                    </span>
                    {inv.isVatChangedFromSigning ? (
                      <span className="inline-flex items-center rounded-full bg-[#f8f7f6] px-[8px] py-[2px] text-[0.6875rem] font-semibold text-[#b76200] ring-1 ring-[#e9dac8] ring-inset dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900/60">
                        {t('invoices.vatChangeBadge', { rate: inv.vatRatePercent })}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-[16px] py-[12px] text-right font-mono text-[#615b57] tabular-nums dark:text-stone-400">
                  {formatEuro(inv.vatCents, intlTag)}
                </td>
                <td className="px-[16px] py-[12px] text-right font-mono font-bold text-[#123054] tabular-nums dark:text-sky-200">
                  {formatEuro(inv.grossTotalCents, intlTag)}
                </td>
                <td className="px-[16px] py-[12px] text-right whitespace-nowrap">
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedInvoice(inv);
                    }}
                    className="rounded-[8px] border border-[#dad9d8] bg-[#FFFFFF] px-[8px] py-[4px] text-[0.75rem] font-semibold text-[#1354a5] transition-colors hover:bg-[#ededed] dark:border-stone-700 dark:bg-stone-800 dark:text-sky-400 dark:hover:bg-stone-700"
                  >
                    {t('invoices.viewBill')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Expand / Collapse Controls */}
      {canToggle ? (
        <div className="mt-[16px] flex flex-wrap items-center justify-between gap-[12px]">
          <p className="text-[0.75rem] text-[#615b57] dark:text-stone-400">
            {!isExpanded
              ? t('invoices.firstThreeNotice')
              : t('invoices.summaryTotalInvoiced', { months: schedule.termMonths })}
          </p>

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="rounded-[8px] border border-[#dad9d8] bg-[#FFFFFF] px-[16px] py-[8px] text-[0.875rem] font-semibold text-[#1354a5] transition-colors hover:bg-[#ededed] dark:border-stone-700 dark:bg-stone-800 dark:text-sky-400 dark:hover:bg-stone-700"
          >
            {isExpanded
              ? t('invoices.showFirstThreeButton')
              : t('invoices.showAllButton', { count: schedule.invoices.length })}
          </button>
        </div>
      ) : null}
      {selectedInvoice ? (
        <InvoiceBillDialog
          invoice={selectedInvoice}
          signedOn={schedule.signedOn}
          termMonths={schedule.termMonths}
          locale={locale}
          asset={asset}
          onClose={() => setSelectedInvoice(null)}
        />
      ) : null}
    </section>
  );
}

export default MonthlyInvoices;
