// Replay a lease month by month (the Wildcard, D-048): what has been invoiced by a given month,
// the VAT rate in force, what leaving early would cost then, and whether the end-of-term choice is
// open. It reads the schedule and the early-exit price; it decides nothing and changes nothing.
import { earlyExitQuote, type ExitContext, type ExitContract } from './early-exit';
import type { Invoice } from './invoicing';
import type { VatBreakdown } from './vat';

export interface ReplayInput {
  /** The invoices the lease issues: the whole schedule, or only those before an ending (D-033). */
  schedule: { downPayment: Invoice | null; invoices: readonly Invoice[] };
  termMonths: number;
  /** What pricing an early exit needs, or null when it can't be priced (e.g. the lease ended). */
  earlyExit: { contract: ExitContract; context: ExitContext } | null;
}

export interface ReplayExit {
  /** When leaving in this month takes effect: the day after the month ends. */
  effectiveDate: string;
  buyGrossCents: number;
  handBackGrossCents: number;
}

export interface ReplayMonth {
  month: number;
  /** This month's rent invoice. */
  invoice: Invoice;
  /** Invoices issued up to and including this month, the down payment (invoice 0) included. */
  issuedCount: number;
  /** Sums of those rounded invoices, so they match what the customer paid. */
  totals: VatBreakdown;
  vatRatePercent: number;
  /** Last month's rate; null in month 1. */
  previousVatRatePercent: number | null;
  /** True in the first month billed at a new rate (Smart Problem 1). */
  vatChanged: boolean;
  earlyExit: ReplayExit | null;
  /** The buy / return / pass-on choice opens on the last invoice date (D-029). */
  endOfTermOpen: boolean;
}

/** How many months there are to replay: every month that was (or will be) invoiced. */
export function replayMonthCount(input: ReplayInput): number {
  return input.schedule.invoices.length;
}

/** The lease as it stands in `month` (1…replayMonthCount). */
export function replayMonth(input: ReplayInput, month: number): ReplayMonth {
  const { invoices, downPayment } = input.schedule;
  if (!Number.isInteger(month) || month < 1 || month > invoices.length) {
    throw new RangeError(`month must be 1…${invoices.length}, got ${month}`);
  }
  const issued = [...(downPayment ? [downPayment] : []), ...invoices.slice(0, month)];
  const totals = issued.reduce(
    (sum, i) => ({
      netCents: sum.netCents + i.netCents,
      vatCents: sum.vatCents + i.vatCents,
      grossCents: sum.grossCents + i.grossCents,
    }),
    { netCents: 0, vatCents: 0, grossCents: 0 }
  );
  const invoice = invoices[month - 1]!;
  const previous = invoices[month - 2];
  return {
    month,
    invoice,
    issuedCount: issued.length,
    totals,
    vatRatePercent: invoice.vatRatePercent,
    previousVatRatePercent: previous?.vatRatePercent ?? null,
    vatChanged: previous !== undefined && previous.vatRatePercent !== invoice.vatRatePercent,
    earlyExit: exitIn(input, month),
    // Only a lease that runs its whole term reaches the final invoice.
    endOfTermOpen: invoices.length === input.termMonths && month === input.termMonths,
  };
}

function exitIn(input: ReplayInput, month: number): ReplayExit | null {
  if (!input.earlyExit) return null;
  const priced = earlyExitQuote(input.earlyExit.contract, input.earlyExit.context, month);
  if (!priced.ok) return null;
  return {
    effectiveDate: priced.quote.effectiveDate,
    buyGrossCents: priced.quote.buy.grossCents,
    handBackGrossCents: priced.quote.handBack.grossCents,
  };
}
