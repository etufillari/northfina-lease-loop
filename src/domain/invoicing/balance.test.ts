import { describe, expect, it } from 'vitest';
import {
  amortisationSchedule,
  amortisationTolerance,
  monthlyInterestCents,
  outstandingBalanceAfter,
  type BalanceInput,
} from './balance';

// Card 1: ebike-003, band B (7.9 %), financed 389 000, factor 0.027584 → rent 10 730, buyout 15 %.
const card1: BalanceInput = {
  financedCents: 389_000,
  annualInterestPercent: 7.9,
  monthlyNetCents: 10_730,
  termMonths: 36,
  buyoutCents: 58_350,
};

// Card 7: farm-002, band D (5.5 %), financed 12 500 000, rent 272 038, buyout 8 %.
const card7: BalanceInput = {
  financedCents: 12_500_000,
  annualInterestPercent: 5.5,
  monthlyNetCents: 272_038,
  termMonths: 48,
  buyoutCents: 1_000_000,
};

describe('monthlyInterestCents', () => {
  it('rounds one month of 7.9 % on 389 000 half up: 2 560.92 → 2 561', () => {
    expect(monthlyInterestCents(389_000, 790)).toBe(2_561);
  });
  it('rounds an exact half up and a negative balance away from zero', () => {
    // 60 000 × 1 bp / 120 000 = 0.5 exactly → 1
    expect(monthlyInterestCents(60_000, 1)).toBe(1);
    expect(monthlyInterestCents(-60_000, 1)).toBe(-1);
    expect(monthlyInterestCents(0, 790)).toBe(0);
  });
});

describe('outstandingBalanceAfter: card 8 (card 1 at month 7)', () => {
  it('is 330 675 after 7 rents, line by line', () => {
    const result = outstandingBalanceAfter(card1, 7);
    expect(result.balanceCents).toBe(330_675);
    expect(result.rows).toHaveLength(7);
    expect(result.rows[0]).toEqual({
      month: 1,
      openingCents: 389_000,
      interestCents: 2_561,
      paymentCents: 10_730,
      closingCents: 380_831,
    });
    for (const [index, row] of result.rows.entries()) {
      expect(row.closingCents).toBe(row.openingCents + row.interestCents - row.paymentCents);
      if (index > 0) expect(row.openingCents).toBe(result.rows[index - 1]!.closingCents);
    }
  });

  it('is below the 29 remaining rents plus the buyout: the interest not yet earned is not charged', () => {
    const { balanceCents } = outstandingBalanceAfter(card1, 7);
    expect(balanceCents).toBeLessThan(29 * 10_730 + 58_350);
  });

  it('is the financed amount before any rent', () => {
    expect(outstandingBalanceAfter(card1, 0)).toMatchObject({ balanceCents: 389_000, rows: [] });
  });
});

describe('outstandingBalanceAfter: the end of the term lands on the buyout', () => {
  it('misses card 1’s buyout 58 350 by 11 cents', () => {
    const result = outstandingBalanceAfter(card1, 36);
    expect(result.balanceCents).toBe(58_361);
    expect(result.driftCents).toBe(11);
    expect(Math.abs(result.driftCents)).toBeLessThanOrEqual(amortisationTolerance(389_000, 36));
  });

  it('misses card 7’s buyout 1 000 000 by −276 cents', () => {
    const result = outstandingBalanceAfter(card7, 48);
    expect(result.endOfTermBalanceCents).toBe(999_724);
    expect(result.driftCents).toBe(-276);
    expect(Math.abs(result.driftCents)).toBeLessThanOrEqual(amortisationTolerance(12_500_000, 48));
  });

  it('reports the same drift whatever monthsPaid is', () => {
    expect(outstandingBalanceAfter(card1, 3).driftCents).toBe(11);
  });
});

describe('outstandingBalanceAfter: edges', () => {
  it('throws beyond the term, on negative months and on a fraction of a cent', () => {
    expect(() => outstandingBalanceAfter(card1, 37)).toThrow(RangeError);
    expect(() => outstandingBalanceAfter(card1, -1)).toThrow(RangeError);
    expect(() => outstandingBalanceAfter({ ...card1, monthlyNetCents: 10_730.5 }, 1)).toThrow(
      RangeError
    );
    expect(() => amortisationSchedule({ ...card1, termMonths: 0 })).toThrow(RangeError);
  });

  it('amortises to exactly zero at 0 % with no buyout', () => {
    const rows = amortisationSchedule({
      financedCents: 120_000,
      annualInterestPercent: 0,
      monthlyNetCents: 10_000,
      termMonths: 12,
      buyoutCents: 0,
    });
    expect(rows.at(-1)!.closingCents).toBe(0);
  });
});

describe('amortisationTolerance', () => {
  it('grows with the term and the financed amount', () => {
    expect(amortisationTolerance(389_000, 36)).toBe(72 + 15);
    expect(amortisationTolerance(12_500_000, 48)).toBe(96 + 600);
    expect(amortisationTolerance(0, 12)).toBe(24);
  });
});
