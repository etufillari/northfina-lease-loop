import { describe, expect, it } from 'vitest';
import type { VatRates } from '@/data/schemas';
import {
  addMonthsClamped,
  daysInMonth,
  generateInvoiceSchedule,
  isLeapYear,
} from './invoice-schedule';

const testVatRates: VatRates = {
  country: 'FI',
  rates: [
    {
      rate_percent: 24.0,
      valid_from: '2013-01-01',
      valid_to: '2024-08-31',
    },
    {
      rate_percent: 25.5,
      valid_from: '2024-09-01',
      valid_to: '2026-12-31',
    },
    {
      rate_percent: 26.0,
      valid_from: '2027-01-01',
      valid_to: null,
      fictional: true,
    },
  ],
};

describe('isLeapYear', () => {
  it('correctly identifies leap years', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(2027)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
  });

  it('rejects invalid years', () => {
    expect(() => isLeapYear(0)).toThrow(RangeError);
    expect(() => isLeapYear(-2024)).toThrow(RangeError);
    expect(() => isLeapYear(2024.5)).toThrow(RangeError);
  });
});

describe('daysInMonth', () => {
  it('returns correct days for standard months', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('rejects invalid months', () => {
    expect(() => daysInMonth(2026, 0)).toThrow(RangeError);
    expect(() => daysInMonth(2026, 13)).toThrow(RangeError);
  });
});

describe('addMonthsClamped', () => {
  it('adds months within the same year without clamping when day fits', () => {
    expect(addMonthsClamped('2026-05-15', 1)).toBe('2026-06-15');
    expect(addMonthsClamped('2026-05-15', 6)).toBe('2026-11-15');
  });

  it('crosses year boundaries correctly', () => {
    expect(addMonthsClamped('2026-11-05', 2)).toBe('2027-01-05');
    expect(addMonthsClamped('2026-11-05', 14)).toBe('2028-01-05');
  });

  it('Scenario Card 4: clamps month ends accurately across leap and non-leap years', () => {
    // Starting on 31 Jan 2026
    const start = '2026-01-31';

    // Feb 2026 (non-leap year, 1 month later) -> 2026-02-28
    expect(addMonthsClamped(start, 1)).toBe('2026-02-28');

    // Feb 2028 (leap year, 25 months later) -> 2028-02-29
    expect(addMonthsClamped(start, 25)).toBe('2028-02-29');

    // Mar 2026 (2 months later) -> 2026-03-31
    expect(addMonthsClamped(start, 2)).toBe('2026-03-31');

    // Apr 2026 (3 months later) -> 2026-04-30
    expect(addMonthsClamped(start, 3)).toBe('2026-04-30');
  });

  it('rejects malformed dates or negative offsets', () => {
    expect(() => addMonthsClamped('invalid-date', 1)).toThrow(RangeError);
    expect(() => addMonthsClamped('2026-01-31', -1)).toThrow(RangeError);
    expect(() => addMonthsClamped('2026-01-31', 1.5)).toThrow(RangeError);
  });
});

describe('generateInvoiceSchedule', () => {
  it('Scenario Card 1: generates the 36-month schedule with first 3 invoices matching worked example', () => {
    // Aino, 36 months, signed 5 Nov 2026, monthlyNetRentCents = 10730
    const schedule = generateInvoiceSchedule({
      signedOn: '2026-11-05',
      termMonths: 36,
      monthlyNetRentCents: 10730,
      vatRates: testVatRates,
    });

    expect(schedule.invoices).toHaveLength(36);
    expect(schedule.signedOn).toBe('2026-11-05');
    expect(schedule.termMonths).toBe(36);
    expect(schedule.monthlyNetRentCents).toBe(10730);
    expect(schedule.signingVatRatePercent).toBe(25.5);

    // Invoice #1: 2026-11-05, 25.5% VAT
    const inv1 = schedule.invoices[0]!;
    expect(inv1.invoiceNumber).toBe(1);
    expect(inv1.dueDate).toBe('2026-11-05');
    expect(inv1.netRentCents).toBe(10730);
    expect(inv1.vatRatePercent).toBe(25.5);
    // 10730 * 0.255 = 2736.15 -> 2736 cents
    expect(inv1.vatCents).toBe(2736);
    expect(inv1.grossTotalCents).toBe(13466);
    expect(inv1.isVatChangedFromSigning).toBe(false);

    // Invoice #2: 2026-12-05, 25.5% VAT
    const inv2 = schedule.invoices[1]!;
    expect(inv2.invoiceNumber).toBe(2);
    expect(inv2.dueDate).toBe('2026-12-05');
    expect(inv2.vatRatePercent).toBe(25.5);
    expect(inv2.vatCents).toBe(2736);
    expect(inv2.grossTotalCents).toBe(13466);
    expect(inv2.isVatChangedFromSigning).toBe(false);

    // Invoice #3: 2027-01-05, 26.0% VAT (VAT reform kicks in!)
    const inv3 = schedule.invoices[2]!;
    expect(inv3.invoiceNumber).toBe(3);
    expect(inv3.dueDate).toBe('2027-01-05');
    expect(inv3.vatRatePercent).toBe(26.0);
    // 10730 * 0.26 = 2789.8 -> 2790 cents
    expect(inv3.vatCents).toBe(2790);
    expect(inv3.grossTotalCents).toBe(13520);
    expect(inv3.isVatChangedFromSigning).toBe(true);
    expect(inv3.vatRateFictional).toBe(true);

    // Check totals
    expect(schedule.totalNetRentCents).toBe(10730 * 36);
    expect(schedule.totalGrossCents).toBe(schedule.totalNetRentCents + schedule.totalVatCents);
  });

  it('Scenario Card 3: 24 months starting 15 Sep 2026 shows Dec 2026 at 25.5% and Jan 2027 at 26.0%', () => {
    // 15 Sep 2026
    const schedule = generateInvoiceSchedule({
      signedOn: '2026-09-15',
      termMonths: 24,
      monthlyNetRentCents: 10000, // €100.00
      vatRates: testVatRates,
    });

    // Month 4 is Dec 2026 (index 3)
    const decInvoice = schedule.invoices[3]!;
    expect(decInvoice.dueDate).toBe('2026-12-15');
    expect(decInvoice.vatRatePercent).toBe(25.5);
    expect(decInvoice.vatCents).toBe(2550);
    expect(decInvoice.grossTotalCents).toBe(12550);
    expect(decInvoice.isVatChangedFromSigning).toBe(false);

    // Month 5 is Jan 2027 (index 4)
    const janInvoice = schedule.invoices[4]!;
    expect(janInvoice.dueDate).toBe('2027-01-15');
    expect(janInvoice.vatRatePercent).toBe(26.0);
    expect(janInvoice.vatCents).toBe(2600);
    expect(janInvoice.grossTotalCents).toBe(12600);
    expect(janInvoice.isVatChangedFromSigning).toBe(true);
  });

  it('validates money integrity: all values are integer cents and gross equals net + vat', () => {
    const schedule = generateInvoiceSchedule({
      signedOn: '2026-01-31',
      termMonths: 48,
      monthlyNetRentCents: 4321,
      vatRates: testVatRates,
    });

    let computedNet = 0;
    let computedVat = 0;
    let computedGross = 0;

    for (const inv of schedule.invoices) {
      expect(Number.isInteger(inv.netRentCents)).toBe(true);
      expect(Number.isInteger(inv.vatCents)).toBe(true);
      expect(Number.isInteger(inv.grossTotalCents)).toBe(true);
      expect(inv.grossTotalCents).toBe(inv.netRentCents + inv.vatCents);

      computedNet += inv.netRentCents;
      computedVat += inv.vatCents;
      computedGross += inv.grossTotalCents;
    }

    expect(schedule.totalNetRentCents).toBe(computedNet);
    expect(schedule.totalVatCents).toBe(computedVat);
    expect(schedule.totalGrossCents).toBe(computedGross);
  });
});
