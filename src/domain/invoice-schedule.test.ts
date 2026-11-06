import * as hegel from '@hegeldev/hegel';
import * as gs from '@hegeldev/hegel/generators';
import { describe, expect, it } from 'vitest';
import type { VatRates } from '@/data/schemas';
import {
  addMonthsClamped,
  daysInMonth,
  formatInvoiceNumber,
  generateFinnishReferenceNumber,
  generateInvoiceSchedule,
  isLeapYear,
} from './invoice-schedule';

const testVatRates: VatRates = {
  country: 'FI',
  note: 'Test rates',
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

describe('formatInvoiceNumber & generateFinnishReferenceNumber', () => {
  it('formats a deterministic invoice number', () => {
    expect(formatInvoiceNumber('2026-11-05', 1)).toBe('LL-20261105-01');
    expect(formatInvoiceNumber('2026-11-05', 12)).toBe('LL-20261105-12');
    expect(() => formatInvoiceNumber('bad', 1)).toThrow(RangeError);
    expect(() => formatInvoiceNumber('2026-11-05', 0)).toThrow(RangeError);
  });

  it('generates a valid Finnish reference number with modulo-10 (7-3-1) check digit', () => {
    const ref = generateFinnishReferenceNumber('2026-11-05', 1);
    const digits = ref.replaceAll(' ', '');
    expect(digits).toMatch(/^\d{14}$/);

    // Verify 7-3-1 check digit
    const body = digits.slice(0, -1);
    const check = Number(digits.slice(-1));
    const weights = [7, 3, 1];
    let sum = 0;
    for (let i = 0; i < body.length; i += 1) {
      sum += Number(body[body.length - 1 - i]) * weights[i % 3]!;
    }
    expect((10 - (sum % 10)) % 10).toBe(check);

    expect(() => generateFinnishReferenceNumber('bad', 1)).toThrow(RangeError);
    expect(() => generateFinnishReferenceNumber('2026-11-05', 0)).toThrow(RangeError);
  });
});

describe('invoice-schedule property tests (Hegel: Money that adds up)', () => {
  // Generator for valid ISO dates from 2024-09-01 through 2030-12-31 (within testVatRates)
  const validIsoDateGen = gs.composite<string>((tc) => {
    const year = tc.draw(gs.integers({ minValue: 2025, maxValue: 2030 }));
    const month = tc.draw(gs.integers({ minValue: 1, maxValue: 12 }));
    const maxDay = daysInMonth(year, month);
    const day = tc.draw(gs.integers({ minValue: 1, maxValue: maxDay }));
    const mStr = String(month).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    return `${year}-${mStr}-${dStr}`;
  });

  it('property: isLeapYear matches the Gregorian century rule for all years', () =>
    hegel.test((tc) => {
      const year = tc.draw(gs.integers({ minValue: 1, maxValue: 9999 }));
      const expected = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      expect(isLeapYear(year)).toBe(expected);
    }));

  it('property: daysInMonth returns 29 for Feb if and only if leap year, and matches standard lengths', () =>
    hegel.test((tc) => {
      const year = tc.draw(gs.integers({ minValue: 1, maxValue: 9999 }));
      const month = tc.draw(gs.integers({ minValue: 1, maxValue: 12 }));
      const days = daysInMonth(year, month);

      if (month === 2) {
        expect(days).toBe(isLeapYear(year) ? 29 : 28);
      } else if ([4, 6, 9, 11].includes(month)) {
        expect(days).toBe(30);
      } else {
        expect(days).toBe(31);
      }
    }));

  it('property: addMonthsClamped preserves start day up to month length, strictly increases, and never drifts', () =>
    hegel.test((tc) => {
      const date = tc.draw(validIsoDateGen);
      const monthsToAdd = tc.draw(gs.integers({ minValue: 0, maxValue: 120 }));

      const result = addMonthsClamped(date, monthsToAdd);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const [origY, origM, origD] = date.split('-').map(Number) as [number, number, number];
      const [resY, resM, resD] = result.split('-').map(Number) as [number, number, number];

      const expectedTotalMonths = origY * 12 + (origM - 1) + monthsToAdd;
      expect(resY * 12 + (resM - 1)).toBe(expectedTotalMonths);

      const maxDaysInTarget = daysInMonth(resY, resM);
      expect(resD).toBe(Math.min(origD, maxDaysInTarget));

      // Monotonicity: adding more months produces a strictly later date
      if (monthsToAdd > 0) {
        const nextMonth = addMonthsClamped(date, monthsToAdd + 1);
        expect(result < nextMonth).toBe(true);
      }
    }));

  it('property: Finnish reference number always has valid 7-3-1 check digit and 5-digit grouping', () =>
    hegel.test((tc) => {
      const date = tc.draw(validIsoDateGen);
      const invoiceNumber = tc.draw(gs.integers({ minValue: 1, maxValue: 999 }));
      const ref = generateFinnishReferenceNumber(date, invoiceNumber);

      // Verify grouping: groups of at most 5 digits, separated by single space
      const groups = ref.split(' ');
      for (const group of groups) {
        expect(group.length).toBeGreaterThanOrEqual(1);
        expect(group.length).toBeLessThanOrEqual(5);
        expect(/^\d+$/.test(group)).toBe(true);
      }

      // Verify checksum
      const digits = ref.replaceAll(' ', '');
      const body = digits.slice(0, -1);
      const check = Number(digits.slice(-1));
      const weights = [7, 3, 1];
      let sum = 0;
      for (let i = 0; i < body.length; i += 1) {
        sum += Number(body[body.length - 1 - i]) * weights[i % 3]!;
      }
      expect((10 - (sum % 10)) % 10).toBe(check);
    }));

  it('property: Money that adds up — every invoice row adds up and schedule totals equal row sums to the cent', () =>
    hegel.test(
      (tc) => {
        const signedOn = tc.draw(validIsoDateGen);
        const termMonths = tc.draw(gs.integers({ minValue: 1, maxValue: 84 }));
        const monthlyNetRentCents = tc.draw(
          gs.integers({ minValue: 0, maxValue: 50_000_000 }) // €0 to €500,000 / month
        );

        const schedule = generateInvoiceSchedule({
          signedOn,
          termMonths,
          monthlyNetRentCents,
          vatRates: testVatRates,
        });

        // 1. Correct number of installments
        expect(schedule.invoices).toHaveLength(termMonths);

        // 2. Schedule metadata matches inputs
        expect(schedule.signedOn).toBe(signedOn);
        expect(schedule.termMonths).toBe(termMonths);
        expect(schedule.monthlyNetRentCents).toBe(monthlyNetRentCents);

        let sumRowNet = 0;
        let sumRowVat = 0;
        let sumRowGross = 0;
        let prevDueDate = '';

        for (let i = 0; i < schedule.invoices.length; i += 1) {
          const inv = schedule.invoices[i]!;

          // Installment index is 1-indexed sequential
          expect(inv.invoiceNumber).toBe(i + 1);

          // All monetary amounts are non-negative safe integers
          expect(Number.isSafeInteger(inv.netRentCents)).toBe(true);
          expect(Number.isSafeInteger(inv.vatCents)).toBe(true);
          expect(Number.isSafeInteger(inv.grossTotalCents)).toBe(true);
          expect(inv.netRentCents).toBeGreaterThanOrEqual(0);
          expect(inv.vatCents).toBeGreaterThanOrEqual(0);
          expect(inv.grossTotalCents).toBeGreaterThanOrEqual(0);

          // "Locked price": every row net rent is identical to monthlyNetRentCents
          expect(inv.netRentCents).toBe(monthlyNetRentCents);

          // Row VAT arithmetic: vatCents is rounded half-up
          const expectedVat = Math.round((inv.netRentCents * inv.vatRatePercent) / 100);
          expect(inv.vatCents).toBe(expectedVat);

          // Row gross arithmetic: gross = net + vat to the exact cent
          expect(inv.grossTotalCents).toBe(inv.netRentCents + inv.vatCents);

          // Calendar dates are strictly monotonic and clamp to month-end
          if (i > 0) {
            expect(inv.dueDate > prevDueDate).toBe(true);
          }
          expect(inv.dueDate).toBe(addMonthsClamped(signedOn, i));
          prevDueDate = inv.dueDate;

          // VAT transition tracking
          expect(inv.isVatChangedFromSigning).toBe(
            inv.vatRatePercent !== schedule.signingVatRatePercent
          );

          sumRowNet += inv.netRentCents;
          sumRowVat += inv.vatCents;
          sumRowGross += inv.grossTotalCents;
        }

        // 3. Contract totals equal the sum of rows exactly (no missing cents, no drift)
        expect(schedule.totalNetRentCents).toBe(monthlyNetRentCents * termMonths);
        expect(schedule.totalNetRentCents).toBe(sumRowNet);
        expect(schedule.totalVatCents).toBe(sumRowVat);
        expect(schedule.totalGrossCents).toBe(sumRowGross);
        expect(schedule.totalGrossCents).toBe(schedule.totalNetRentCents + schedule.totalVatCents);
      },
      { testCases: 250 }
    ));
});
