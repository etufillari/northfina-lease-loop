import type { ForecastInvoice } from './lease-billing';

export type ForecastPaymentPeriod = Omit<ForecastInvoice, 'dueDate'> & {
  startDate: string;
  endDate: string;
  paymentCount: number;
};

/** Keep the next forecast and each change, with the dates the monthly amount applies. */
export function forecastPaymentChanges(
  invoices: readonly ForecastInvoice[],
  issuedDates: readonly string[],
  today: string
): ForecastPaymentPeriod[] {
  const issued = new Set(issuedDates);
  const future = invoices
    .filter((invoice) => invoice.dueDate >= today && !issued.has(invoice.dueDate))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const periods: ForecastPaymentPeriod[] = [];
  for (const invoice of future) {
    const previous = periods[periods.length - 1];
    if (
      previous &&
      previous.netCents === invoice.netCents &&
      previous.vatBasisPoints === invoice.vatBasisPoints &&
      previous.vatCents === invoice.vatCents &&
      previous.totalCents === invoice.totalCents
    ) {
      previous.endDate = invoice.dueDate;
      previous.paymentCount++;
    } else {
      periods.push({
        startDate: invoice.dueDate,
        endDate: invoice.dueDate,
        paymentCount: 1,
        netCents: invoice.netCents,
        vatBasisPoints: invoice.vatBasisPoints,
        vatCents: invoice.vatCents,
        totalCents: invoice.totalCents,
      });
    }
  }
  return periods;
}
