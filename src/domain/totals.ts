import type { VatRates } from '@/data/schemas';
import { invoiceSchedule, termEndDate } from './invoicing';
import type { PriceTerms } from './pricing';
import { taxOn } from './vat';

export type IssuedAmount = { kind: string; period: number; grossCents: number };

/** A forecast reuses issued amounts; it never rewrites an issued invoice with today's tax. */
export function leaseTotals(input: {
  terms: PriceTerms;
  startDate: string;
  upfrontDate: string;
  vatRates: VatRates;
  issued?: readonly IssuedAmount[];
}) {
  const { terms, startDate, upfrontDate, vatRates, issued = [] } = input;
  const schedule = invoiceSchedule(
    { startDate, termMonths: terms.termMonths, monthlyNetCents: terms.monthlyNetCents },
    vatRates
  );
  const upfront = taxOn(terms.downPaymentCents, upfrontDate, vatRates);
  const buyout = taxOn(terms.buyoutNetCents, termEndDate(startDate, terms.termMonths), vatRates);
  if (!schedule.ok || !upfront.ok || !buyout.ok) return { ok: false as const };
  // The server must scope documents to the contract and enforce uniqueness.
  // Match Array.find's first-record behavior, including a recorded zero amount.
  const rentByPeriod = new Map<number, number>();
  for (const invoice of issued) {
    if (!Number.isSafeInteger(invoice.grossCents) || invoice.grossCents < 0) {
      throw new RangeError('issued amounts must be non-negative safe integer cents');
    }
    if (invoice.kind === 'rent' && !rentByPeriod.has(invoice.period)) {
      rentByPeriod.set(invoice.period, invoice.grossCents);
    }
  }
  const rentGrossCents = schedule.invoices.reduce(
    (sum, forecast) => sum + (rentByPeriod.get(forecast.period) ?? forecast.grossCents),
    0
  );
  const upfrontGrossCents =
    issued.find((invoice) => invoice.kind === 'down_payment')?.grossCents ??
    upfront.amount.grossCents;
  const buyoutGrossCents =
    issued.find((invoice) => invoice.kind === 'buyout')?.grossCents ?? buyout.amount.grossCents;
  const useGrossCents = upfrontGrossCents + rentGrossCents;
  const ownGrossCents = useGrossCents + buyoutGrossCents;
  const issuedGrossCents = issued.reduce((sum, invoice) => sum + invoice.grossCents, 0);
  if (
    ![rentGrossCents, useGrossCents, ownGrossCents, issuedGrossCents].every(
      (value) => Number.isSafeInteger(value) && value >= 0
    )
  ) {
    throw new RangeError('totals must remain non-negative safe integer cents');
  }
  return { ok: true as const, rentGrossCents, useGrossCents, ownGrossCents, issuedGrossCents };
}
