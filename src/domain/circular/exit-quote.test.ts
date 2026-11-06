import { describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { LeaseTerms } from '@/domain/lease-engine/types';
import { calculateExitQuote } from './exit-quote';
const rates = (await loadVatRates()).rates;
const terms: LeaseTerms = {
  contractId: 'c',
  assetId: 'ebike-003',
  customerId: 'cust-aino',
  startDate: '2026-11-05',
  termMonths: 36,
  monthlyNetCents: 10730,
  paymentDueDays: 14,
};
describe('explainable exit quote', () => {
  it('card8 shows remaining rents, signed cap, dated VAT and total', () => {
    expect(calculateExitQuote(terms, 58350, 6, rates)).toMatchObject({
      remainingMonths: 30,
      remainingRentNetCents: 321900,
      buyoutCapNetCents: 58350,
      feeNetCents: 58350,
      effectiveOn: '2027-05-05',
      vatCents: 15171,
      grossCents: 73521,
      rateBps: 2600,
    });
  });
  it('near the end charges remaining rent instead of a larger buyout cap', () => {
    expect(calculateExitQuote(terms, 58350, 35, rates).feeNetCents).toBe(10730);
  });
  it('uses the original monthly anchor for a short-month exit', () => {
    expect(
      calculateExitQuote({ ...terms, startDate: '2026-01-31' }, 58350, 1, rates).effectiveOn
    ).toBe('2026-02-28');
  });
  it('rejects invalid boundaries, unsafe amounts and missing tax rules', () => {
    for (const month of [0, -1, 36, 37, 1.5])
      expect(() => calculateExitQuote(terms, 58350, month, rates)).toThrow();
    expect(() => calculateExitQuote(terms, 58350, 6, [])).toThrow();
    expect(() =>
      calculateExitQuote({ ...terms, monthlyNetCents: Number.MAX_SAFE_INTEGER }, 58350, 6, rates)
    ).toThrow();
  });
});
