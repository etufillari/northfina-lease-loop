import type { VatRates } from '@/data/schemas';
import { isIsoDate } from './calendar';
import { canScheduleLease, invoiceSchedule, termEndDate, type InvoiceDraft } from './invoicing';
import type { PriceTerms } from './pricing';
import { leaseTotals } from './totals';
import { taxOn, type TaxedAmount } from './vat';

/** Amounts are per rental invoice, not totals for the grouped periods. */
export type RentalVatPeriod = TaxedAmount & {
  firstDate: string;
  lastDate: string;
  count: number;
};

export type PriceExplanation = {
  terms: PriceTerms;
  firstRent: InvoiceDraft;
  rentalPeriods: RentalVatPeriod[];
  upfront: TaxedAmount;
  buyout: TaxedAmount;
  endDate: string;
  rentNetCents: number;
  useNetCents: number;
  ownNetCents: number;
  rentGrossCents: number;
  useGrossCents: number;
  ownGrossCents: number;
};

export type PriceExplanationInput = {
  terms: PriceTerms;
  startDate: string;
  upfrontDate: string;
  vatRates: VatRates;
};

export type PriceExplanationResult =
  | { ok: true; explanation: PriceExplanation }
  | { ok: false; reason: 'invalid_date' | 'no_vat_rate' };

/** A planned payment breakdown; issued invoices remain authoritative after signing. */
export function explainPrice(input: PriceExplanationInput): PriceExplanationResult {
  const { terms, startDate, upfrontDate, vatRates } = input;
  if (!isIsoDate(upfrontDate) || !canScheduleLease(startDate, terms.termMonths)) {
    return { ok: false, reason: 'invalid_date' };
  }
  const endDate = termEndDate(startDate, terms.termMonths);
  const schedule = invoiceSchedule(
    { startDate, termMonths: terms.termMonths, monthlyNetCents: terms.monthlyNetCents },
    vatRates
  );
  const upfront = taxOn(terms.downPaymentCents, upfrontDate, vatRates);
  const buyout = taxOn(terms.buyoutNetCents, endDate, vatRates);
  const totals = leaseTotals(input);
  if (!schedule.ok || !upfront.ok || !buyout.ok || !totals.ok) {
    return { ok: false, reason: 'no_vat_rate' };
  }

  const rentalPeriods: RentalVatPeriod[] = [];
  for (const invoice of schedule.invoices) {
    const last = rentalPeriods.at(-1);
    if (last?.vatBasisPoints === invoice.vatBasisPoints) {
      last.lastDate = invoice.invoiceDate;
      last.count += 1;
    } else {
      rentalPeriods.push({
        firstDate: invoice.invoiceDate,
        lastDate: invoice.invoiceDate,
        count: 1,
        netCents: invoice.netCents,
        vatBasisPoints: invoice.vatBasisPoints,
        vatCents: invoice.vatCents,
        grossCents: invoice.grossCents,
      });
    }
  }

  return {
    ok: true,
    explanation: {
      terms,
      // canScheduleLease guarantees at least one full rental period.
      firstRent: schedule.invoices[0]!,
      rentalPeriods,
      upfront: upfront.amount,
      buyout: buyout.amount,
      endDate,
      rentNetCents: terms.totalRentNetCents,
      useNetCents: terms.downPaymentCents + terms.totalRentNetCents,
      ownNetCents: terms.downPaymentCents + terms.totalRentNetCents + terms.buyoutNetCents,
      rentGrossCents: totals.rentGrossCents,
      useGrossCents: totals.useGrossCents,
      ownGrossCents: totals.ownGrossCents,
    },
  };
}
