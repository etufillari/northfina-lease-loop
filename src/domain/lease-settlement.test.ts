import { describe, expect, it } from 'vitest';
import {
  agreedReturnTotalCents,
  buyoutBreakdown,
  settlementQuote,
  withAgreedReturnPrice,
  type SettlementInput,
} from './lease-settlement';

const input: SettlementInput = {
  monthlyNetCents: 10730,
  buyoutCents: 58350,
  remainingMonths: 29,
  annualRateBasisPoints: 790,
  recoveryCents: 200000,
  vatBasisPoints: 2550,
  outstandingCents: 0,
};
const quote = (changes: Partial<SettlementInput> = {}) => settlementQuote({ ...input, ...changes });

describe('settlementQuote', () => {
  it('discounts future cash flows and applies the selected VAT to the settlement', () => {
    const result = quote();
    const rate = 0.079 / 12;
    const expected = Math.round(
      (10730 * (1 - (1 + rate) ** -29)) / rate + 58350 / (1 + rate) ** 29
    );
    expect(result.buyoutNetCents).toBe(expected);
    expect(result.buyoutNetCents).toBeLessThan(10730 * 29 + 58350);
    expect(result.returnNetCents).toBe(expected - 200000);
    expect(result.buyoutTotalCents).toBe(expected + Math.round(expected * 0.255));
    expect(result.policyVersion).toBe('settlement-v3');
  });

  it('handles zero interest and rounds half cents upwards', () => {
    expect(quote({ annualRateBasisPoints: 0, remainingMonths: 2 })).toMatchObject({
      buyoutNetCents: 79810,
      remainingRentNetCents: 21460,
      returnNetCents: 0,
    });
    expect(
      quote({
        monthlyNetCents: 1,
        buyoutCents: 0,
        remainingMonths: 1,
        annualRateBasisPoints: 0,
        vatBasisPoints: 5000,
      }).buyoutTotalCents
    ).toBe(2);
  });

  it('reaches the contractual buyout and ordinary zero-fee return at the agreed end', () => {
    expect(quote({ remainingMonths: 0, recoveryCents: 0, outstandingCents: 12345 })).toMatchObject({
      buyoutNetCents: 58350,
      buyoutTotalCents: 85574,
      returnNetCents: 0,
      returnTotalCents: 12345,
      remainingRentNetCents: 0,
    });
  });

  it('adds already-gross arrears exactly once without charging VAT to them again', () => {
    const without = quote();
    const withArrears = quote({ outstandingCents: 10001 });
    expect(withArrears.buyoutTotalCents - without.buyoutTotalCents).toBe(10001);
    expect(withArrears.returnTotalCents - without.returnTotalCents).toBe(10001);
  });

  it('floors return charges at zero and caps them at discounted remaining rents', () => {
    expect(quote({ recoveryCents: 999999 }).returnNetCents).toBe(0);
    const noRecovery = quote({ recoveryCents: 0 });
    expect(noRecovery.returnNetCents).toBe(noRecovery.remainingRentNetCents);
    expect(noRecovery.returnNetCents).toBeLessThan(noRecovery.buyoutNetCents);
  });

  it('reduces the buyout as fewer future payments remain without subtracting paid rent twice', () => {
    const amounts = Array.from(
      { length: 37 },
      (_, remainingMonths) => quote({ remainingMonths }).buyoutNetCents
    );
    expect(amounts[0]).toBe(input.buyoutCents);
    expect(amounts.every((amount, index) => index === 0 || amount >= amounts[index - 1]!)).toBe(
      true
    );
  });

  it.each([
    { monthlyNetCents: -1 },
    { buyoutCents: 0.5 },
    { remainingMonths: -1 },
    { remainingMonths: 121 },
    { annualRateBasisPoints: -1 },
    { annualRateBasisPoints: 100001 },
    { recoveryCents: -1 },
    { vatBasisPoints: -1 },
    { outstandingCents: 0.1 },
  ])('rejects invalid settlement facts: %j', (changes) =>
    expect(() => quote(changes)).toThrow(RangeError)
  );
});

it('charges new damage at maturity without adding the same damage twice', () => {
  const quote = settlementQuote({
    monthlyNetCents: 10000,
    buyoutCents: 50000,
    remainingMonths: 0,
    annualRateBasisPoints: 790,
    recoveryCents: 30000,
    vatBasisPoints: 2550,
    outstandingCents: 0,
    damageCents: 7500,
  });
  expect(quote.returnNetCents).toBe(7500);
  expect(quote.returnTotalCents).toBe(9413);
});

describe('buyoutBreakdown', () => {
  const finance = {
    monthlyNetCents: 10000,
    buyoutCents: 50000,
    remainingMonths: 24,
    annualRateBasisPoints: 790,
    recoveryCents: 0,
    vatBasisPoints: 2550,
    outstandingCents: 1929,
  };
  it('adds up exactly and shows what paying early saves', () => {
    const parts = buyoutBreakdown(finance);
    expect(
      parts.allPaymentsCents + parts.endPriceCents - parts.interestSavedCents + parts.unpaidCents
    ).toBe(parts.totalCents);
    expect(parts.remainingPayments).toBe(24);
    expect(parts.interestSavedCents).toBeGreaterThan(0);
  });
  it('saves nothing when nothing is left to discount', () => {
    const parts = buyoutBreakdown({ ...finance, remainingMonths: 0 });
    expect(parts.interestSavedCents).toBe(0);
    expect(parts.allPaymentsCents).toBe(0);
  });
});

describe('agreed return price', () => {
  const agreed = {
    vatBasisPoints: 2550,
    earlyReturnNetCents: 10000,
    customerRepairNetCents: 5000,
    repairShareBasisPoints: 9000,
  };

  it('adds VAT once to the agreed amounts and current unpaid rent as it stands', () => {
    expect(agreedReturnTotalCents(agreed, 0)).toBe(18825);
    expect(agreedReturnTotalCents(agreed, 1234)).toBe(20059);
  });

  it('allows a return that costs nothing', () => {
    expect(
      agreedReturnTotalCents({ ...agreed, earlyReturnNetCents: 0, customerRepairNetCents: 0 }, 0)
    ).toBe(0);
  });

  it('rejects a negative unpaid amount', () => {
    expect(() => agreedReturnTotalCents(agreed, -1)).toThrow(RangeError);
  });

  it('replaces the return figures and leaves the buyout alone', () => {
    const settlement = settlementQuote({
      monthlyNetCents: 5000,
      buyoutCents: 20000,
      remainingMonths: 12,
      annualRateBasisPoints: 900,
      recoveryCents: 1000,
      vatBasisPoints: 2550,
      outstandingCents: 0,
      damageCents: 99999,
    });
    expect(withAgreedReturnPrice(settlement, agreed, 100)).toEqual({
      ...settlement,
      returnNetCents: 15000,
      returnTotalCents: 18925,
      earlyReturnNetCents: 10000,
      customerRepairNetCents: 5000,
      repairShareBasisPoints: 9000,
    });
  });
});
