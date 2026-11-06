import type { CoefficientTable, VatRate } from '@/data/schemas';
import { monthlyFactorFor } from './coefficient';
import { forecastInvoices, quoteAmounts } from './lease-billing';

export function checkoutQuote(
  priceCents: number,
  downPaymentCents: number,
  termMonths: number,
  today: string,
  table: CoefficientTable,
  rates: readonly VatRate[]
) {
  if (
    !Number.isSafeInteger(priceCents) ||
    !Number.isSafeInteger(downPaymentCents) ||
    downPaymentCents < 0 ||
    downPaymentCents > priceCents
  )
    return null;
  const financed = priceCents - downPaymentCents;
  const factor = monthlyFactorFor(table, financed, termMonths);
  const buyout = table.end_of_term_buyout_percent_of_financed[String(termMonths)];
  if (!factor.ok || buyout === undefined) return null;
  const quote = quoteAmounts(financed, factor.factor, buyout);
  const schedule = forecastInvoices(today, termMonths, quote.monthlyNetCents, rates);
  if (!schedule.ok || !schedule.invoices[0]) return null;
  return {
    ...quote,
    monthlyTotalCents: schedule.invoices[0].totalCents,
    totalCents: schedule.invoices.reduce((sum, invoice) => sum + invoice.totalCents, 0),
  };
}
