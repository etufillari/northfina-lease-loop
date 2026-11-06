// The monthly invoices of a contract. Net rent is locked; VAT is not. Each invoice takes the
// rate on its own date and stores it, so a later VAT change never touches an existing invoice.
import type { Contract, Invoice } from '@/data/lease-schemas';
import type { VatRates } from '@/data/schemas';
import { addDays, addMonths } from '../dates';
import { vatCents, vatRateOn } from '../vat';

type ScheduledContract = Pick<
  Contract,
  'id' | 'start_on' | 'term_months' | 'monthly_net_rent_cents'
>;

/**
 * Every invoice of a contract, without ids. One invoice per month of the term, each due on
 * its invoice date and each a full month, so a mid-month start needs no proration. Dates
 * always count from the start date, so a clamped month does not stick: a contract starting
 * 31 Jan is invoiced 28 Feb and then 31 Mar. The rent is one rounded figure, so the net
 * amounts add up to exactly rent × term.
 */
export function invoiceSchedule(
  contract: ScheduledContract,
  vatRates: VatRates
): Omit<Invoice, 'id'>[] {
  const { id, start_on, term_months, monthly_net_rent_cents: netCents } = contract;

  return Array.from({ length: term_months }, (_, month) => {
    const invoiceDate = addMonths(start_on, month);
    const rate = vatRateOn(vatRates, invoiceDate);
    if (!rate.ok) throw new RangeError(`no VAT rate on ${invoiceDate}`);

    const vat = vatCents(netCents, rate.rateBasisPoints);
    return {
      contract_id: id,
      sequence: month + 1,
      period_start: invoiceDate,
      period_end: addDays(addMonths(start_on, month + 1), -1),
      invoice_date: invoiceDate,
      due_date: invoiceDate,
      net_cents: netCents,
      vat_rate_basis_points: rate.rateBasisPoints,
      vat_cents: vat,
      total_cents: netCents + vat,
      status: 'issued',
    };
  });
}
