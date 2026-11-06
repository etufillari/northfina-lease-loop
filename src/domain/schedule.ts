// The contract's invoice schedule (ARCHITECTURE.md §6.3). Generated once at signing and
// stored; rows are never edited afterwards. `rowStatus` is derived on read from `asOf`.
//
// - Rent is billed in advance. Rent row k is dated `addMonthsClamped(start, k)`, counted
//   from the start date (never chained), and covers [date_k, date_{k+1} − 1 day]. Every
//   period is one full month, so nothing is prorated.
// - The due date is the invoice date. Payment terms are not modelled.
// - Every rent row has the same locked net. VAT is looked up on each row's own invoice
//   date and rounded once per row: vat = mulDivRound(net, vatRateBp, 10 000).
// - Totals are sums of the rows, so they always add up to the cent.
import type { VatRates } from '@/data/schemas';
import { addDays, addMonthsClamped, compareIso, isValidIsoDate } from './calendar';
import { mulDivRound } from './rounding';
import { vatRateOn } from './vat';

export type ScheduleRowKind = 'down_payment' | 'rent';

export type ScheduleRow = {
  /** 0-based order within the contract. */
  seq: number;
  kind: ScheduleRowKind;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  netCents: number;
  vatRateBp: number;
  vatCents: number;
  grossCents: number;
};

export type ScheduleInput = {
  startDate: string;
  termMonths: number;
  monthlyNetRentCents: number;
  downPaymentCents: number;
};

export type Schedule = {
  rows: ScheduleRow[];
  /** Net rent only: monthlyNetRentCents × termMonths. */
  totalRentNetCents: number;
  /** Net of every row, down payment included. */
  totalNetCents: number;
  /** Gross of every row. */
  totalGrossCents: number;
  /** Last day of the last rent period. */
  endDate: string;
};

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
}

/** Net + VAT for one invoice line on `invoiceDate`. Throws if no VAT rate covers the date. */
export function priceLine(netCents: number, invoiceDate: string, vatRates: VatRates) {
  assertNonNegativeInteger('netCents', netCents);
  const vat = vatRateOn(vatRates, invoiceDate);
  if (!vat.ok) throw new Error(`No VAT rate found for invoice date ${invoiceDate}`);
  const vatCents = mulDivRound(netCents, vat.rateBp, 10_000);
  return { netCents, vatRateBp: vat.rateBp, vatCents, grossCents: netCents + vatCents };
}

/** Builds every row of a contract's schedule: an optional down payment, then the rents. */
export function generateSchedule(input: ScheduleInput, vatRates: VatRates): Schedule {
  const { startDate, termMonths, monthlyNetRentCents, downPaymentCents } = input;
  if (!isValidIsoDate(startDate)) {
    throw new RangeError(`startDate must be a real YYYY-MM-DD date, got "${startDate}"`);
  }
  if (!Number.isInteger(termMonths) || termMonths < 1) {
    throw new RangeError(`termMonths must be a positive integer, got ${termMonths}`);
  }
  assertNonNegativeInteger('monthlyNetRentCents', monthlyNetRentCents);
  assertNonNegativeInteger('downPaymentCents', downPaymentCents);

  const rows: ScheduleRow[] = [];
  if (downPaymentCents > 0) {
    rows.push({
      seq: 0,
      kind: 'down_payment',
      invoiceDate: startDate,
      periodStart: startDate,
      periodEnd: startDate,
      ...priceLine(downPaymentCents, startDate, vatRates),
    });
  }

  for (let k = 0; k < termMonths; k += 1) {
    const invoiceDate = addMonthsClamped(startDate, k);
    rows.push({
      seq: rows.length,
      kind: 'rent',
      invoiceDate,
      periodStart: invoiceDate,
      periodEnd: addDays(addMonthsClamped(startDate, k + 1), -1),
      ...priceLine(monthlyNetRentCents, invoiceDate, vatRates),
    });
  }

  return {
    rows,
    totalRentNetCents: monthlyNetRentCents * termMonths,
    totalNetCents: rows.reduce((sum, r) => sum + r.netCents, 0),
    totalGrossCents: rows.reduce((sum, r) => sum + r.grossCents, 0),
    endDate: rows[rows.length - 1]!.periodEnd,
  };
}

export type RowStatus = 'upcoming' | 'due' | 'past';

/**
 * Where a row stands on `asOf`: `upcoming` before its invoice date, `due` from the invoice
 * date to the end of its period, `past` after that. There is no payments model, so
 * "past" means billed, not paid.
 */
export function rowStatus(
  row: Pick<ScheduleRow, 'invoiceDate' | 'periodEnd'>,
  asOf: string
): RowStatus {
  if (compareIso(asOf, row.invoiceDate) < 0) return 'upcoming';
  if (compareIso(asOf, row.periodEnd) <= 0) return 'due';
  return 'past';
}
