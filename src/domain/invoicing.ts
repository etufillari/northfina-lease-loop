import type { VatRates } from '@/data/schemas';
import { addMonthsAnchored, isIsoDate } from './calendar';
import { taxOn, type TaxedAmount } from './vat';

export type InvoiceDraft = TaxedAmount & { period: number; invoiceDate: string; dueDate: string };

function checkTerm(termMonths: number): void {
  if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 1200) {
    throw new RangeError('schedule needs 1..1200 whole months');
  }
}

/** User-entered dates must leave room for maturity, not just the final rental period. */
export function canScheduleLease(startDate: string, termMonths: number): boolean {
  if (!isIsoDate(startDate) || !Number.isInteger(termMonths) || termMonths < 1 || termMonths > 1200)
    return false;
  return startDate <= addMonthsAnchored('9999-12-31', -termMonths);
}

/** These are previews, not persisted invoices. The server separately records issuance. */
export function invoiceSchedule(
  contract: { startDate: string; termMonths: number; monthlyNetCents: number },
  vatRates: VatRates
): { ok: true; invoices: InvoiceDraft[] } | { ok: false; reason: 'no_vat_rate' } {
  checkTerm(contract.termMonths);
  const invoices: InvoiceDraft[] = [];
  for (let index = 0; index < contract.termMonths; index++) {
    const invoiceDate = addMonthsAnchored(contract.startDate, index);
    const taxed = taxOn(contract.monthlyNetCents, invoiceDate, vatRates);
    if (!taxed.ok) return taxed;
    // Baseline policy: full first month, issue and due on the same scheduled day.
    invoices.push({ period: index + 1, invoiceDate, dueDate: invoiceDate, ...taxed.amount });
  }
  return { ok: true, invoices };
}

/** Maturity follows the last rental period; it is not an extra rental invoice. */
export function termEndDate(startDate: string, termMonths: number): string {
  checkTerm(termMonths);
  return addMonthsAnchored(startDate, termMonths);
}
