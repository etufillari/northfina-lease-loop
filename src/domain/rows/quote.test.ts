import { describe, expect, it } from 'vitest';
import { quoteRow } from '../../../tests/helpers/row-examples';
import { quoteRowSchema } from './quote';

const refuses = (row: unknown) => quoteRowSchema.safeParse(row).success === false;

describe('quoteRowSchema: the stored quote (D7), on the worked example (card 1)', () => {
  it('accepts the worked example: 389 000 financed, factor 0.027584, rent 10 730', () => {
    expect(quoteRowSchema.parse(quoteRow())).toEqual(quoteRow());
  });

  it('takes a row without an id: the database makes one', () => {
    const { id: _id, ...row } = quoteRow();
    expect(quoteRowSchema.safeParse(row).success).toBe(true);
  });

  it('takes the named next customer of a pass-on, or none (D90)', () => {
    expect(refuses({ ...quoteRow(), customer_id: 'cust-lena' })).toBe(false);
    expect(refuses({ ...quoteRow(), customer_id: null })).toBe(false);
    expect(refuses({ ...quoteRow(), customer_id: '' })).toBe(true);
  });

  it('refuses an unknown column, so a typo fails before the write', () => {
    expect(refuses({ ...quoteRow(), monthly_nett_cents: 10730 })).toBe(true);
  });

  it('refuses negative and fractional cents', () => {
    expect(refuses({ ...quoteRow(), buyout_cents: -1 })).toBe(true);
    expect(refuses({ ...quoteRow(), list_price_cents: 389000.5 })).toBe(true);
  });

  it('refuses a day that does not exist', () => {
    expect(refuses({ ...quoteRow(), quote_date: '2026-02-30' })).toBe(true);
  });

  it('refuses a financed amount that is not list × quantity − down payment', () => {
    expect(refuses({ ...quoteRow(), financed_cents: 388999 })).toBe(true);
  });

  it('refuses a down payment above the price', () => {
    const fleet = { ...quoteRow(), down_payment_cents: 389001, financed_cents: 0 };
    expect(refuses(fleet)).toBe(true);
  });

  it('checks the financed amount on the whole quantity (D8), not one unit', () => {
    const listPrice = 389000;
    const four = {
      ...quoteRow(),
      quantity: 4,
      financed_cents: listPrice * 4,
      monthly_net_cents: 42921, // 1 556 000 × 0.027584 = 42 920.7 → 42 921
    };
    expect(quoteRowSchema.safeParse(four).success).toBe(true);
    expect(refuses({ ...four, financed_cents: listPrice })).toBe(true);
  });

  it('refuses a rent that is not the financed amount × the factor, rounded half up once (D1)', () => {
    expect(refuses({ ...quoteRow(), monthly_net_cents: 10731 })).toBe(true);
    expect(refuses({ ...quoteRow(), monthly_net_cents: 10729 })).toBe(true);
  });

  it('refuses a validity that is not the quote day + 14 days (D7)', () => {
    expect(refuses({ ...quoteRow(), valid_until: '2026-11-18' })).toBe(true);
    expect(refuses({ ...quoteRow(), valid_until: '2026-11-04' })).toBe(true);
  });

  it('refuses a VAT rate above 100 % (a percent written as basis points twice)', () => {
    expect(refuses({ ...quoteRow(), vat_rate_bp_at_quote: 255000 })).toBe(true);
  });
});
