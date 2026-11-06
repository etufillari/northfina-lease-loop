import { describe, expect, it } from 'vitest';
import { invoiceAmounts } from './lease-billing';
import { vatChange } from './vat-change';

const rates = [
  { valid_from: '2024-09-01', valid_to: '2026-12-31', rate_percent: 25.5 },
  { valid_from: '2027-01-01', valid_to: null, rate_percent: 26, fictional: true },
];
const payment = (dueDate: string, netCents: number, vatBasisPoints: number) => ({
  dueDate,
  netCents,
  vatBasisPoints,
  ...invoiceAmounts(netCents, vatBasisPoints),
});

describe('vatChange', () => {
  it('card 3: same net rent, VAT 25.5 % → 26 %, the exact cent difference', () => {
    // An example monthly net rent; only the VAT rate differs between the two months.
    const december = payment('2026-12-15', 8417, 2550);
    const january = payment('2027-01-15', 8417, 2600);
    expect(vatChange(december, january, rates)).toEqual({
      fromBasisPoints: 2550,
      toBasisPoints: 2600,
      differenceCents: january.totalCents - december.totalCents,
      netCents: 8417,
      fictional: true,
    });
    expect(january.totalCents - december.totalCents).toBe(42);
  });
  it('card 1: Aino’s rent goes up by 54 cents', () => {
    const change = vatChange(
      payment('2026-12-05', 10730, 2550),
      payment('2027-01-05', 10730, 2600),
      rates
    );
    expect(change?.differenceCents).toBe(54);
  });
  it('is null without a change or a previous payment', () => {
    const january = payment('2027-01-05', 10730, 2600);
    expect(vatChange(payment('2027-02-05', 10730, 2600), january, rates)).toBeNull();
    expect(vatChange(undefined, january, rates)).toBeNull();
  });
  it('marks only data-pack rates flagged fictional', () => {
    const change = vatChange(
      payment('2024-08-05', 10730, 2400),
      payment('2024-09-05', 10730, 2550),
      rates
    );
    expect(change?.fictional).toBe(false);
  });
});
