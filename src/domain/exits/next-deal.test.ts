// D90: a pass-on starts the next deal: a quote for the named customer, priced from the market
// value on the exit day, on the default term when the item may be offered it.
import { describe, expect, it } from 'vitest';
import { nextDealQuote } from './next-deal';

describe('nextDealQuote (D90)', () => {
  it('card 8: the market value 259 230 per unit, 36 months, no down payment, on the exit day', () => {
    expect(
      nextDealQuote({
        assetId: 'ebike-003',
        marketValueCents: 259_230,
        allowedTerms: [12, 24, 36],
        today: '2027-06-05',
      })
    ).toEqual({
      assetId: 'ebike-003',
      unitPriceCents: 259_230,
      termMonths: 36,
      downPaymentCents: 0,
      today: '2027-06-05',
    });
  });

  it('an item that may not be offered 36 months gets its first allowed term', () => {
    const base = { assetId: 'a', marketValueCents: 1, today: '2027-01-01' };
    expect(nextDealQuote({ ...base, allowedTerms: [12, 24] }).termMonths).toBe(12);
  });

  it('no allowed term at all keeps the default and lets the pricing refuse it', () => {
    const base = { assetId: 'a', marketValueCents: 1, today: '2027-01-01' };
    expect(nextDealQuote({ ...base, allowedTerms: [] }).termMonths).toBe(36);
  });

  it('a market value below zero or not whole is refused', () => {
    const base = { assetId: 'a', allowedTerms: [36], today: '2027-01-01' };
    expect(() => nextDealQuote({ ...base, marketValueCents: -1 })).toThrow(RangeError);
    expect(() => nextDealQuote({ ...base, marketValueCents: 1.5 })).toThrow(RangeError);
  });
});
