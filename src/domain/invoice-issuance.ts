// Spine step 5: issuing invoices. An invoice is issued for every month of an active contract
// whose due date has arrived, built only from the contract's locked terms (start date, term,
// monthly net rent), never from today's price list. VAT is looked up for each invoice's own due
// date and then stored on the invoice, so a later VAT change never rewrites it. Pure: the date,
// the VAT table and the already issued due dates are arguments.
import type { VatRate } from '@/data/schemas';
import { dueDateForMonth, invoiceAmounts, type ForecastInvoice } from './lease-billing';

export type BillableContract = {
  status: string;
  startDate: string;
  termMonths: number;
  monthlyNetCents: number;
  isDemo: boolean;
};

export type DueInvoice = ForecastInvoice & {
  /**
   * Demo leases simulate an autopaying customer: an invoice already past its due date is
   * recorded as paid on that date. The invoice due today stays open. Real leases never are.
   */
  paid: boolean;
};

/** The invoices that should exist on `today` and haven't been issued yet, oldest first. */
export function invoicesDue(
  contract: BillableContract,
  today: string,
  rates: readonly VatRate[],
  issuedDueDates: Iterable<string>
): { ok: true; invoices: DueInvoice[] } | { ok: false; reason: 'missing_vat_rate' } {
  // Only a signed, running contract is billed: not one waiting for a signatory, nor one
  // that ended by return or buyout.
  if (contract.status !== 'active') return { ok: true, invoices: [] };
  if (!Number.isInteger(contract.termMonths) || contract.termMonths < 1)
    throw new RangeError('Invalid lease term');
  const issued = new Set(issuedDueDates);
  const invoices: DueInvoice[] = [];
  // One invoice per month of the term, so none after the last month.
  for (let month = 0; month < contract.termMonths; month++) {
    const dueDate = dueDateForMonth(contract.startDate, month);
    if (dueDate > today) break;
    if (issued.has(dueDate)) continue;
    const rate = rates.find(
      (item) => item.valid_from <= dueDate && (item.valid_to === null || item.valid_to >= dueDate)
    );
    if (!rate) return { ok: false, reason: 'missing_vat_rate' };
    // Rates are percentages such as 25.5; convert once to exact basis points.
    const vatBasisPoints = Math.round(rate.rate_percent * 100);
    invoices.push({
      dueDate,
      netCents: contract.monthlyNetCents,
      vatBasisPoints,
      ...invoiceAmounts(contract.monthlyNetCents, vatBasisPoints),
      paid: contract.isDemo && dueDate < today,
    });
  }
  return { ok: true, invoices };
}
