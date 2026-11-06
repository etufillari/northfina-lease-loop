import { describe, expect, it } from 'vitest';
import tableData from '../../data/coefficient-table.json';
import vatData from '../../data/vat-rates.json';
import { coefficientTableSchema, vatRatesSchema } from '@/data/schemas';
import { checkoutQuote } from './checkout-quote';

const table = coefficientTableSchema.parse(tableData);
const rates = vatRatesSchema.parse(vatData).rates;
describe('checkoutQuote', () => {
  it('uses the chosen down payment and term with VAT', () => {
    expect(checkoutQuote(389000, 0, 36, '2026-11-05', table, rates)).toMatchObject({
      monthlyNetCents: 10730,
      monthlyTotalCents: 13466,
      buyoutCents: 58350,
    });
    expect(
      checkoutQuote(389000, 100000, 36, '2026-11-05', table, rates)?.monthlyNetCents
    ).toBeLessThan(10730);
  });
  it('rejects invalid amounts, unsupported terms, and missing tax dates', () => {
    expect(checkoutQuote(389000, 400000, 36, '2026-11-05', table, rates)).toBeNull();
    expect(checkoutQuote(389000, 0, 3, '2026-11-05', table, rates)).toBeNull();
    expect(checkoutQuote(389000, 0, 36, '1900-01-01', table, rates)).toBeNull();
  });
});
