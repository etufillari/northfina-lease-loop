// Pure domain logic for generating monthly lease invoice schedules.
//
// Rules enforced per RULES.md:
// - No I/O, no database, no fetch, no Date.now() / new Date() / Math.random().
// - Pure functions accepting dates (ISO YYYY-MM-DD) and plain data structures.
// - All money amounts are integer euro cents.
// - Rounding rule: VAT per invoice is Math.round((netRentCents * vatRatePercent) / 100).
// - Gross invoice total is strictly netRentCents + vatCents.
// - Date math: Month-end clamping for calendar traps (e.g. 31 Jan -> 28 Feb in normal years, 29 Feb in leap years).

import type { VatRates } from '@/data/schemas';
import { vatRateOn } from './contract-pricing';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Returns true if the specified Gregorian calendar year is a leap year.
 */
export function isLeapYear(year: number): boolean {
  if (!Number.isInteger(year) || year < 1) {
    throw new RangeError(`year must be a positive integer, got ${year}`);
  }
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/**
 * Returns the number of days in a given month (1 = January, 12 = December).
 */
export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || year < 1) {
    throw new RangeError(`year must be a positive integer, got ${year}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`month must be between 1 and 12, got ${month}`);
  }

  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

/**
 * Adds `monthsToAdd` months to an ISO `YYYY-MM-DD` date, clamping the day of the
 * month to the last day of the target month when the target month is shorter.
 *
 * Example:
 *   addMonthsClamped('2026-01-31', 1) => '2026-02-28' (2026 is non-leap)
 *   addMonthsClamped('2026-01-31', 25) => '2028-02-29' (2028 is a leap year)
 *   addMonthsClamped('2026-08-31', 1) => '2026-09-30'
 */
export function addMonthsClamped(isoDate: string, monthsToAdd: number): string {
  const match = ISO_DATE_PATTERN.exec(isoDate);
  if (!match) {
    throw new RangeError(`isoDate must look like YYYY-MM-DD, got "${isoDate}"`);
  }
  if (!Number.isInteger(monthsToAdd) || monthsToAdd < 0) {
    throw new RangeError(`monthsToAdd must be a non-negative integer, got ${monthsToAdd}`);
  }

  const origYear = Number(match[1]);
  const origMonth = Number(match[2]);
  const origDay = Number(match[3]);

  const totalMonths = origYear * 12 + (origMonth - 1) + monthsToAdd;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;

  const maxDays = daysInMonth(targetYear, targetMonth);
  const targetDay = Math.min(origDay, maxDays);

  const yStr = String(targetYear).padStart(4, '0');
  const mStr = String(targetMonth).padStart(2, '0');
  const dStr = String(targetDay).padStart(2, '0');

  return `${yStr}-${mStr}-${dStr}`;
}

export type MonthlyInvoice = {
  /** Invoice number in the contract sequence (1-indexed, 1..termMonths) */
  invoiceNumber: number;
  /** Due date of this invoice in ISO format (YYYY-MM-DD) */
  dueDate: string;
  /** Locked net rent in euro cents */
  netRentCents: number;
  /** General VAT rate in effect on `dueDate` (e.g. 25.5 or 26.0) */
  vatRatePercent: number;
  /** Whether the VAT rate on this date is designated fictional (e.g. 2027 reform) */
  vatRateFictional: boolean;
  /** Computed VAT amount in euro cents: Math.round((netRentCents * vatRatePercent) / 100) */
  vatCents: number;
  /** Total invoice payable in euro cents: netRentCents + vatCents */
  grossTotalCents: number;
  /** True if the VAT rate on `dueDate` differs from the VAT rate on contract signing date */
  isVatChangedFromSigning: boolean;
  /** The VAT rate percent at contract signing date for comparison */
  signingVatRatePercent: number;
};

export type GenerateInvoiceScheduleInput = {
  /** Date the contract was signed / started in ISO format (YYYY-MM-DD) */
  signedOn: string;
  /** Total term length in months (e.g. 12, 24, 36, 48) */
  termMonths: number;
  /** Locked monthly net rent in euro cents */
  monthlyNetRentCents: number;
  /** VAT rates repository */
  vatRates: VatRates;
  /** Optional down payment net cents recorded on the contract */
  downPaymentCents?: number;
};

export type InvoiceSchedule = {
  signedOn: string;
  termMonths: number;
  monthlyNetRentCents: number;
  signingVatRatePercent: number;
  invoices: MonthlyInvoice[];
  /** Sum of all monthly net rents across the schedule (in euro cents) */
  totalNetRentCents: number;
  /** Sum of all monthly VAT amounts across the schedule (in euro cents) */
  totalVatCents: number;
  /** Sum of all gross monthly payments across the schedule (in euro cents) */
  totalGrossCents: number;
};

/**
 * Generates the full schedule of monthly invoices for a signed lease contract.
 *
 * Implements:
 * 1. Calendar scheduling: Invoices are spaced 1 month apart starting on `signedOn`,
 *    with day-of-month clamping for shorter months (Feb 28/29, 30-day months).
 * 2. Smart Problem 1 ("Lock the price, not the tax"): Net monthly rent is locked,
 *    while statutory VAT is looked up on each individual invoice due date.
 */
export function generateInvoiceSchedule(input: GenerateInvoiceScheduleInput): InvoiceSchedule {
  const { signedOn, termMonths, monthlyNetRentCents, vatRates } = input;

  if (!ISO_DATE_PATTERN.test(signedOn)) {
    throw new RangeError(`signedOn must look like YYYY-MM-DD, got "${signedOn}"`);
  }
  if (!Number.isInteger(termMonths) || termMonths <= 0) {
    throw new RangeError(`termMonths must be a positive integer, got ${termMonths}`);
  }
  if (!Number.isInteger(monthlyNetRentCents) || monthlyNetRentCents < 0) {
    throw new RangeError(
      `monthlyNetRentCents must be a non-negative integer, got ${monthlyNetRentCents}`
    );
  }

  const signingVat = vatRateOn(vatRates, signedOn);
  if (!signingVat.ok) {
    throw new Error(`No VAT rate found for signing date ${signedOn}`);
  }
  const signingVatRatePercent = signingVat.ratePercent;

  const invoices: MonthlyInvoice[] = [];
  let totalNetRentCents = 0;
  let totalVatCents = 0;
  let totalGrossCents = 0;

  for (let index = 0; index < termMonths; index += 1) {
    const invoiceNumber = index + 1;
    const dueDate = addMonthsClamped(signedOn, index);
    const invoiceVat = vatRateOn(vatRates, dueDate);

    if (!invoiceVat.ok) {
      throw new Error(`No VAT rate found for invoice due date ${dueDate}`);
    }

    const vatCents = Math.round((monthlyNetRentCents * invoiceVat.ratePercent) / 100);
    const grossTotalCents = monthlyNetRentCents + vatCents;
    const isVatChangedFromSigning = invoiceVat.ratePercent !== signingVatRatePercent;

    invoices.push({
      invoiceNumber,
      dueDate,
      netRentCents: monthlyNetRentCents,
      vatRatePercent: invoiceVat.ratePercent,
      vatRateFictional: invoiceVat.fictional,
      vatCents,
      grossTotalCents,
      isVatChangedFromSigning,
      signingVatRatePercent,
    });

    totalNetRentCents += monthlyNetRentCents;
    totalVatCents += vatCents;
    totalGrossCents += grossTotalCents;
  }

  return {
    signedOn,
    termMonths,
    monthlyNetRentCents,
    signingVatRatePercent,
    invoices,
    totalNetRentCents,
    totalVatCents,
    totalGrossCents,
  };
}
