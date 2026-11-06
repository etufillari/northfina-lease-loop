// Pure domain logic for generating monthly lease invoice schedules.
//
// Rules enforced per RULES.md:
// - No I/O, no database, no fetch, no Date.now() / new Date() / Math.random().
// - Pure functions accepting dates (ISO YYYY-MM-DD) and plain data structures.
// - All money amounts are integer euro cents.
// - Rounding rule: VAT per invoice is mulDivRound(net, vatRateBp, 10 000), half up (./rounding).
// - Gross invoice total is strictly netRentCents + vatCents.
// - Date math: Month-end clamping for calendar traps (e.g. 31 Jan -> 28 Feb in normal years, 29 Feb in leap years).

import type { VatRates } from '@/data/schemas';
import { generateSchedule } from './schedule';
import { vatRateOn } from './vat';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// Calendar helpers live in ./calendar; re-exported so existing imports keep working.
export { addMonthsClamped, daysInMonth, isLeapYear } from './calendar';

/**
 * Formats a deterministic, human-readable invoice document number from the contract
 * signing date (`YYYY-MM-DD`) and 1-indexed installment number.
 *
 * Example: formatInvoiceNumber('2026-11-05', 1) => 'LL-20261105-01'
 */
export function formatInvoiceNumber(signedOn: string, invoiceNumber: number): string {
  const match = ISO_DATE_PATTERN.exec(signedOn);
  if (!match) {
    throw new RangeError(`signedOn must look like YYYY-MM-DD, got "${signedOn}"`);
  }
  if (!Number.isInteger(invoiceNumber) || invoiceNumber < 1) {
    throw new RangeError(`invoiceNumber must be a positive integer, got ${invoiceNumber}`);
  }
  const compactDate = `${match[1]}${match[2]}${match[3]}`;
  return `LL-${compactDate}-${String(invoiceNumber).padStart(2, '0')}`;
}

/**
 * Generates a deterministic Finnish banking reference number (viitenumero) with a
 * valid modulo-10 (weights 7, 3, 1 from right to left) check digit, formatted in
 * groups of 5 digits from the right.
 */
export function generateFinnishReferenceNumber(signedOn: string, invoiceNumber: number): string {
  const match = ISO_DATE_PATTERN.exec(signedOn);
  if (!match) {
    throw new RangeError(`signedOn must look like YYYY-MM-DD, got "${signedOn}"`);
  }
  if (!Number.isInteger(invoiceNumber) || invoiceNumber < 1) {
    throw new RangeError(`invoiceNumber must be a positive integer, got ${invoiceNumber}`);
  }

  const base = `10${match[1]}${match[2]}${match[3]}${String(invoiceNumber).padStart(3, '0')}`;
  const weights = [7, 3, 1] as const;
  let sum = 0;
  for (let i = 0; i < base.length; i += 1) {
    const digit = Number(base[base.length - 1 - i]);
    sum += digit * weights[i % 3]!;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  const full = `${base}${checkDigit}`;

  const groups: string[] = [];
  for (let end = full.length; end > 0; end -= 5) {
    const start = Math.max(0, end - 5);
    groups.unshift(full.slice(start, end));
  }
  return groups.join(' ');
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
  /** VAT in euro cents: mulDivRound(netRentCents, vatRateBp, 10 000), half up */
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

  // One schedule, one rounding rule: the rows come from ./schedule.
  const schedule = generateSchedule(
    { startDate: signedOn, termMonths, monthlyNetRentCents, downPaymentCents: 0 },
    vatRates
  );

  const invoices: MonthlyInvoice[] = schedule.rows.map((row, index) => {
    const invoiceVat = vatRateOn(vatRates, row.invoiceDate);
    if (!invoiceVat.ok) {
      throw new Error(`No VAT rate found for invoice due date ${row.invoiceDate}`);
    }
    return {
      invoiceNumber: index + 1,
      dueDate: row.invoiceDate,
      netRentCents: row.netCents,
      vatRatePercent: invoiceVat.ratePercent,
      vatRateFictional: invoiceVat.fictional,
      vatCents: row.vatCents,
      grossTotalCents: row.grossCents,
      isVatChangedFromSigning: invoiceVat.ratePercent !== signingVatRatePercent,
      signingVatRatePercent,
    };
  });
  const totalNetRentCents = schedule.totalRentNetCents;
  const totalGrossCents = schedule.totalGrossCents;
  const totalVatCents = totalGrossCents - totalNetRentCents;

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
