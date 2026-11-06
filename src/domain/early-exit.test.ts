import { describe, expect, it } from 'vitest';
import { earlyExitQuote, type EarlyExitInput } from './early-exit';

// Scenario card 8: Aino's ebike-003, 36 months from 5 Nov 2026, band B (7.9 %), 10730 a month,
// buyout 58350. In month 7 (invoices 1–7 issued by 5 May 2027) she wants out.
const aino = (overrides: Partial<EarlyExitInput> = {}): EarlyExitInput => ({
  startDate: '2026-11-05',
  termMonths: 36,
  monthlyNetCents: 10_730,
  buyoutCents: 58_350,
  annualInterestPercent: 7.9,
  invoicesIssued: 7,
  marketValueCents: 287_860, // ebike-003 at 10 months: 74 % × new × no usage
  vatPercent: 26,
  today: '2027-05-20',
  ...overrides,
});

describe('earlyExitQuote', () => {
  it('card 8: month 7 of 36 — 29 rents left, discounted, against today’s market value', () => {
    const quote = earlyExitQuote(aino());
    expect(quote).toMatchObject({
      coolingOff: false,
      remainingMonths: 29,
      remainingRentsCents: 311_170, // 29 × 10730, before discounting
    });
    // Discounting at 7.9 % a year makes the rest cheaper than paying it all now
    expect(quote.presentRentsCents).toBeLessThan(311_170);
    expect(quote.presentBuyoutCents).toBeLessThan(58_350);
    expect(quote.stillOwedCents).toBe(quote.presentRentsCents + quote.presentBuyoutCents);
    // Returning costs what is still owed minus what the bike is worth today
    expect(quote.return.netCents).toBe(quote.stillOwedCents - 287_860);
    expect(quote.return.totalCents).toBe(quote.return.netCents + quote.return.vatCents);
  });

  it('agrees with the normal end of term: buying in the last month costs the buyout', () => {
    expect(earlyExitQuote(aino({ invoicesIssued: 36 })).buy.netCents).toBe(58_350);
  });

  it('gets cheaper month by month', () => {
    const fees = [2, 7, 18, 30].map(
      (invoicesIssued) => earlyExitQuote(aino({ invoicesIssued })).stillOwedCents
    );
    expect([...fees].sort((a, b) => b - a)).toEqual(fees);
  });

  it('costs nothing to return when the item is worth more than what is still owed', () => {
    expect(earlyExitQuote(aino({ marketValueCents: 1_000_000 })).return).toEqual({
      netCents: 0,
      vatCents: 0,
      totalCents: 0,
    });
  });

  it('is free to return within the first month, before the second invoice', () => {
    const quote = earlyExitQuote(aino({ invoicesIssued: 1, today: '2026-12-04' }));
    expect(quote.coolingOff).toBe(true);
    expect(quote.return.totalCents).toBe(0);
    expect(earlyExitQuote(aino({ invoicesIssued: 2, today: '2026-12-05' })).coolingOff).toBe(false);
  });

  it('without interest, what is still owed is simply the rents left plus the buyout', () => {
    const quote = earlyExitQuote(aino({ annualInterestPercent: 0 }));
    expect(quote.stillOwedCents).toBe(311_170 + 58_350);
  });
});
