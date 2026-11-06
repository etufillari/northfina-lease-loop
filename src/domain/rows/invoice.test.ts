import { describe, expect, it } from 'vitest';
import { invoiceRow } from '../../../tests/helpers/row-examples';
import { invoiceRowSchema } from './invoice';

const refuses = (row: unknown) => invoiceRowSchema.safeParse(row).success === false;

const downPayment = () => ({
  ...invoiceRow(),
  sequence: 0,
  kind: 'down_payment',
  period_start: null,
  period_end: null,
  net_cents: 2000000,
  vat_cents: 510000,
  gross_cents: 2510000,
});

describe('invoiceRowSchema: one invoice, gross = net + VAT in cents', () => {
  it('accepts card 1’s first rent: 10 730 + 2 736 = 13 466', () => {
    expect(invoiceRowSchema.parse(invoiceRow())).toEqual(invoiceRow());
  });

  it('refuses a gross that is not net + VAT', () => {
    expect(refuses({ ...invoiceRow(), gross_cents: 13467 })).toBe(true);
  });

  it('refuses VAT that is not the net × rate rounded half up (D1): 2 736.15 is 2 736', () => {
    expect(refuses({ ...invoiceRow(), vat_cents: 2737, gross_cents: 13467 })).toBe(true);
  });

  it('takes the January 2027 rate on its own line (card 3): 10 730 × 26 % = 2 789.8 → 2 790', () => {
    const january = { ...invoiceRow(), vat_rate_bp: 2600, vat_cents: 2790, gross_cents: 13520 };
    expect(invoiceRowSchema.safeParse(january).success).toBe(true);
  });

  it('a rent invoice has its period; the period ends on or after it starts', () => {
    expect(refuses({ ...invoiceRow(), period_start: null, period_end: null })).toBe(true);
    expect(refuses({ ...invoiceRow(), period_end: '2026-11-04' })).toBe(true);
    expect(refuses({ ...invoiceRow(), period_end: null })).toBe(true);
  });

  it('a down payment, buyout or early-exit invoice has no period', () => {
    expect(invoiceRowSchema.safeParse(downPayment()).success).toBe(true);
    expect(refuses({ ...downPayment(), period_start: '2026-11-05' })).toBe(true);
    expect(
      invoiceRowSchema.safeParse({ ...downPayment(), sequence: 37, kind: 'buyout' }).success
    ).toBe(true);
  });

  it('is due on or after its issue day', () => {
    expect(refuses({ ...invoiceRow(), due_date: '2026-11-04' })).toBe(true);
  });

  it('a paid invoice has its paid day, and an issued one has none', () => {
    expect(refuses({ ...invoiceRow(), status: 'paid' })).toBe(true);
    expect(refuses({ ...invoiceRow(), paid_on: '2026-11-06' })).toBe(true);
    expect(
      invoiceRowSchema.safeParse({ ...invoiceRow(), status: 'paid', paid_on: '2026-11-06' }).success
    ).toBe(true);
  });

  it('refuses a negative sequence and an unknown kind', () => {
    expect(refuses({ ...invoiceRow(), sequence: -1 })).toBe(true);
    expect(refuses({ ...invoiceRow(), kind: 'reminder_fee' })).toBe(true);
  });
});
