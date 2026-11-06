import { centsSchema, isoDateSchema, type VatRates } from '@/data/schemas';
import { contractDatesFor } from './contract';
import { addDays, addMonthsClamped } from './calendar';
import { vatOn } from './vat';

export type InvoiceScheduleContract = {
  startsOn: string;
  endsOn: string;
  termMonths: number;
  monthlyNetRentCents: number;
};

export type ScheduledInvoice = {
  sequence: number;
  periodStart: string;
  periodEnd: string;
  dueOn: string;
  netRentCents: number;
  vatRateBasisPoints: number;
  vatCents: number;
  totalCents: number;
};

export type InvoiceScheduleResult =
  | { ok: true; invoices: ScheduledInvoice[] }
  | {
      ok: false;
      reason: 'no_vat_rate_on_date';
      sequence: number;
      invoiceDate: string;
    };

function assertContract(contract: InvoiceScheduleContract): void {
  if (!isoDateSchema.safeParse(contract.startsOn).success) {
    throw new RangeError(`startsOn must be a valid ISO date, got "${contract.startsOn}"`);
  }
  if (!isoDateSchema.safeParse(contract.endsOn).success) {
    throw new RangeError(`endsOn must be a valid ISO date, got "${contract.endsOn}"`);
  }
  if (!Number.isSafeInteger(contract.termMonths) || contract.termMonths <= 0) {
    throw new RangeError(`termMonths must be a positive whole number, got ${contract.termMonths}`);
  }
  if (!centsSchema.safeParse(contract.monthlyNetRentCents).success) {
    throw new RangeError(
      `monthlyNetRentCents must be a non-negative whole number of cents, got ${contract.monthlyNetRentCents}`
    );
  }

  const expectedEnd = contractDatesFor(contract.startsOn, contract.termMonths).endsOn;
  if (expectedEnd !== contract.endsOn) {
    throw new RangeError(`endsOn must be the ${contract.termMonths}-month boundary after startsOn`);
  }
}

function rateBasisPoints(ratePercent: number): number {
  return Math.round(ratePercent * 100);
}

/**
 * Builds a complete, deterministic schedule from locked contract pricing.
 * Rent is never prorated or recalculated. VAT is rounded once by vatOn for each due date.
 */
export function invoiceScheduleFor(
  contract: InvoiceScheduleContract,
  vatRates: VatRates
): InvoiceScheduleResult {
  assertContract(contract);

  const invoices: ScheduledInvoice[] = [];
  for (let index = 0; index < contract.termMonths; index += 1) {
    const dueOn = addMonthsClamped(contract.startsOn, index);
    const nextDueOn =
      index + 1 === contract.termMonths
        ? contract.endsOn
        : addMonthsClamped(contract.startsOn, index + 1);
    const vat = vatOn(vatRates, contract.monthlyNetRentCents, dueOn);

    if (!vat.ok) {
      return { ok: false, reason: 'no_vat_rate_on_date', sequence: index + 1, invoiceDate: dueOn };
    }

    invoices.push({
      sequence: index + 1,
      periodStart: dueOn,
      periodEnd: addDays(nextDueOn, -1),
      dueOn,
      netRentCents: vat.netAmountCents,
      vatRateBasisPoints: rateBasisPoints(vat.ratePercent),
      vatCents: vat.vatCents,
      totalCents: vat.grossCents,
    });
  }

  return { ok: true, invoices };
}
