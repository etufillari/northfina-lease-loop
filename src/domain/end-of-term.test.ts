import { describe, expect, it } from 'vitest';
import type { VatRates } from '@/data/schemas';
import {
  endOfTerm,
  endOfTermDates,
  stillOutUntil,
  type EndedContract,
  type EndOfTermChoice,
} from './end-of-term';

const vatRates: VatRates = {
  country: 'FI',
  note: 'test rates',
  rates: [
    { rate_percent: 25.5, valid_from: '2024-09-01', valid_to: '2026-12-31' },
    { rate_percent: 26, valid_from: '2027-01-01', valid_to: null },
  ],
};

// Card 1: Aino, ebike-003, 36 months from 5 Nov 2026. Buyout 15 % of 389 000 = 58 350 (DATA.md).
const aino: EndedContract = {
  customerId: 'cust-aino',
  startDate: '2026-11-05',
  termMonths: 36,
  monthlyNetRentCents: 10_730,
  buyoutCents: 58_350,
  billing: 'start_day_full_months',
};
const delivered = { condition: 'new', usageValue: 0 } as const;

const decide = (choice: EndOfTermChoice, today: string, contract = aino) =>
  endOfTerm(contract, vatRates, delivered, choice, today);

describe('endOfTermDates', () => {
  it('opens on the last invoice date and hands over the day after the last period (card 1)', () => {
    // Invoice 36 is dated 5 Oct 2029 and covers 5 Oct – 4 Nov 2029.
    expect(endOfTermDates(aino)).toEqual({
      opensOn: '2029-10-05',
      lastDay: '2029-11-04',
      handoverDate: '2029-11-05',
    });
  });

  it('clamps a 31st start to the last day of short months (card 4)', () => {
    // laptop-001 from 31 Jan 2026 for 36 months: invoice 36 on 31 Dec 2028,
    // last period 31 Dec 2028 – 30 Jan 2029, handover 31 Jan 2029.
    expect(endOfTermDates({ ...aino, startDate: '2026-01-31' })).toEqual({
      opensOn: '2028-12-31',
      lastDay: '2029-01-30',
      handoverDate: '2029-01-31',
    });
  });

  it('handles a leap-day start', () => {
    // 29 Feb 2028 + 12 months clamps to 28 Feb 2029; the last day is 27 Feb 2029.
    expect(endOfTermDates({ ...aino, startDate: '2028-02-29', termMonths: 12 })).toEqual({
      opensOn: '2029-01-29',
      lastDay: '2029-02-27',
      handoverDate: '2029-02-28',
    });
  });
});

describe('endOfTerm: buy', () => {
  it('invoices the locked buyout with VAT at the rate on the handover date (card 1)', () => {
    // 58 350 × 26 % = 15 171.00 → 15 171; total 73 521.
    expect(decide({ kind: 'buy' }, '2029-10-05')).toEqual({
      ok: true,
      ending: {
        kind: 'buy',
        decidedOn: '2029-10-05',
        effectiveDate: '2029-11-05',
        buyoutInvoice: {
          invoiceDate: '2029-11-05',
          netCents: 58_350,
          vatRatePercent: 26,
          vatCents: 15_171,
          grossCents: 73_521,
        },
      },
    });
  });

  it('charges the old VAT rate when the handover is before the 2027 change', () => {
    // 12 months from 1 Dec 2025: handover 1 Dec 2026, VAT 25.5 %.
    // 100 001 × 25.5 % = 25 500.255 → 25 500; total 125 501.
    const short = { ...aino, startDate: '2025-12-01', termMonths: 12, buyoutCents: 100_001 };
    const result = decide({ kind: 'buy' }, '2026-11-01', short);
    expect(result.ok && result.ending.buyoutInvoice).toEqual({
      invoiceDate: '2026-12-01',
      netCents: 100_001,
      vatRatePercent: 25.5,
      vatCents: 25_500,
      grossCents: 125_501,
    });
  });

  it('dates a late decision on the day it is made', () => {
    const result = decide({ kind: 'buy' }, '2029-12-01');
    expect(result.ok && result.ending.effectiveDate).toBe('2029-12-01');
    expect(result.ok && result.ending.buyoutInvoice?.invoiceDate).toBe('2029-12-01');
  });

  it('refuses when no VAT rate covers the handover date', () => {
    const noFuture: VatRates = { country: 'FI', note: 'test rates', rates: [vatRates.rates[0]!] };
    expect(endOfTerm(aino, noFuture, delivered, { kind: 'buy' }, '2029-10-05')).toEqual({
      ok: false,
      reason: 'no_vat_rate',
    });
  });
});

describe('endOfTerm: return and pass on', () => {
  const inspection = { condition: 'good', usageValue: 18_400 } as const;

  it('records the condition and usage at handover', () => {
    expect(decide({ kind: 'return', ...inspection }, '2029-11-05')).toEqual({
      ok: true,
      ending: {
        kind: 'return',
        decidedOn: '2029-11-05',
        effectiveDate: '2029-11-05',
        inspection: { condition: 'good', usageValue: 18_400 },
      },
    });
  });

  it('names the next lessee when passing the item on', () => {
    const result = decide(
      { kind: 'pass_on', ...inspection, nextLessee: 'cust-sanna' },
      '2029-10-20'
    );
    expect(result).toEqual({
      ok: true,
      ending: {
        kind: 'pass_on',
        decidedOn: '2029-10-20',
        effectiveDate: '2029-11-05',
        inspection: { condition: 'good', usageValue: 18_400 },
        nextLessee: 'cust-sanna',
      },
    });
  });

  it('accepts the same condition and usage as at delivery', () => {
    expect(decide({ kind: 'return', ...delivered }, '2029-11-05').ok).toBe(true);
  });

  it('refuses usage below the reading at delivery', () => {
    const used = endOfTerm(
      aino,
      vatRates,
      { condition: 'good', usageValue: 5_000 },
      { kind: 'return', condition: 'good', usageValue: 4_999 },
      '2029-11-05'
    );
    expect(used).toEqual({ ok: false, reason: 'usage_went_down' });
  });

  it('refuses a condition better than at delivery', () => {
    const fair = endOfTerm(
      aino,
      vatRates,
      { condition: 'fair', usageValue: 0 },
      { kind: 'return', condition: 'good', usageValue: 10 },
      '2029-11-05'
    );
    expect(fair).toEqual({ ok: false, reason: 'condition_improved' });
  });

  it('refuses passing the item on to the same customer', () => {
    const self = decide({ kind: 'pass_on', ...inspection, nextLessee: 'cust-aino' }, '2029-11-05');
    expect(self).toEqual({ ok: false, reason: 'next_lessee_is_current' });
  });

  it('refuses a negative or fractional usage reading', () => {
    expect(() =>
      decide({ kind: 'return', condition: 'good', usageValue: -1 }, '2029-11-05')
    ).toThrow(RangeError);
    expect(() =>
      decide({ kind: 'return', condition: 'good', usageValue: 1.5 }, '2029-11-05')
    ).toThrow(RangeError);
  });
});

describe('endOfTerm: timing', () => {
  it('refuses a choice before the last invoice date', () => {
    expect(decide({ kind: 'buy' }, '2029-10-04')).toEqual({
      ok: false,
      reason: 'too_early',
      opensOn: '2029-10-05',
    });
  });
});

describe('stillOutUntil', () => {
  // An ending decided before it takes effect: the lessee keeps the item until then (B2).
  const ending = { effectiveDate: '2027-06-05' };

  it('is the hand-back day while the lessee still has the item', () => {
    expect(stillOutUntil(ending, '2027-05-10')).toBe('2027-06-05');
    expect(stillOutUntil(ending, '2027-06-04')).toBe('2027-06-05');
  });

  it('is null from the hand-back day on, or when nothing has ended', () => {
    expect(stillOutUntil(ending, '2027-06-05')).toBeNull();
    expect(stillOutUntil(ending, '2027-07-01')).toBeNull();
    expect(stillOutUntil(null, '2027-05-10')).toBeNull();
  });
});
