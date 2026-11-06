import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadVatRates } from '@/data/load';
import type { CoefficientTable, VatRates } from '@/data/schemas';
import { earlyExitQuote } from './early-exit';

let table: CoefficientTable;
let vatRates: VatRates;
beforeAll(async () => {
  table = await loadCoefficientTable();
  vatRates = await loadVatRates();
});

// Aino's contract from scenario card 1: ebike-003, 36 months, rent 107.30 €, total 3 862.86 €.
const ainoContract = { financedCents: 389_000, termMonths: 36, netTotalCents: 386_286 };

describe('earlyExitQuote', () => {
  it('scenario card 8: Aino exits in month 7 — the 12-month tier covers 7 months', () => {
    const result = earlyExitQuote({
      contract: ainoContract,
      usedMonths: 7,
      paidNetCents: 7 * 10_730,
      exitDate: '2027-06-04',
      table,
      vatRates,
    });
    expect(result).toMatchObject({
      ok: true,
      breakdown: {
        // 7 months used is above the 6-month minimum, so all 7 are charged.
        chargedMonths: 7,
        coveringTermMonths: 12,
        // 389 000 × 0.054799 = 21 316.811 → 21 317 a month on the 12-month tier.
        fairMonthlyNetCents: 21_317,
        fairTotalNetCents: 149_219,
        paidNetCents: 75_110,
        // Two months at the re-priced rate.
        handlingFeeNetCents: 42_634,
        // 149 219 − 75 110 + 42 634, far below the 311 176 still outstanding.
        exitNetCents: 116_743,
        cappedAtRemaining: false,
        vatRatePercent: 26,
        exitVatCents: 30_353,
        exitTotalCents: 147_096,
      },
    });
  });

  it('always charges at least 6 months: leaving in month 1 pays for 6 months plus the fee', () => {
    const result = earlyExitQuote({
      contract: ainoContract,
      usedMonths: 1,
      paidNetCents: 10_730,
      exitDate: '2026-12-04',
      table,
      vatRates,
    });
    expect(result).toMatchObject({
      ok: true,
      breakdown: {
        usedMonths: 1,
        chargedMonths: 6,
        coveringTermMonths: 12,
        fairTotalNetCents: 6 * 21_317,
        handlingFeeNetCents: 2 * 21_317,
        // 127 902 − 10 730 + 42 634
        exitNetCents: 159_806,
        cappedAtRemaining: false,
      },
    });
  });

  it('the minimum applies up to month 6 and gives way to the real use from month 7', () => {
    const charged = (usedMonths: number) => {
      const result = earlyExitQuote({
        contract: ainoContract,
        usedMonths,
        paidNetCents: usedMonths * 10_730,
        exitDate: '2027-06-04',
        table,
        vatRates,
      });
      if (!result.ok) throw new Error(result.reason);
      return result.breakdown.chargedMonths;
    };
    expect([1, 5, 6, 7, 8].map(charged)).toEqual([6, 6, 6, 7, 8]);
  });

  it('picks the covering term, not the contract term: month 18 of 36 uses the 24-month tier', () => {
    const result = earlyExitQuote({
      contract: ainoContract,
      usedMonths: 18,
      paidNetCents: 18 * 10_730,
      exitDate: '2028-05-04',
      table,
      vatRates,
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.breakdown.coveringTermMonths).toBe(24);
  });

  it('near the end leaving never costs more than staying: the fee is capped at what is left', () => {
    const result = earlyExitQuote({
      contract: ainoContract,
      usedMonths: 35,
      paidNetCents: 35 * 10_730,
      exitDate: '2029-10-04',
      table,
      vatRates,
    });
    if (!result.ok) throw new Error(result.reason);
    // Covering term = the contract's own 36: the re-price nets out and the two-month fee
    // (21 460) would exceed the 10 736 still outstanding, so the exit costs exactly that.
    expect(result.breakdown.coveringTermMonths).toBe(36);
    expect(result.breakdown.handlingFeeNetCents).toBe(21_460);
    expect(result.breakdown.exitNetCents).toBe(10_736);
    expect(result.breakdown.cappedAtRemaining).toBe(true);
    expect(result.breakdown.exitNetCents).toBe(
      ainoContract.netTotalCents - result.breakdown.paidNetCents
    );
  });

  it('costs nothing at the full term: that is a plain return, consistent with the buyout option', () => {
    const result = earlyExitQuote({
      contract: ainoContract,
      usedMonths: 36,
      paidNetCents: 386_286,
      exitDate: '2029-11-04',
      table,
      vatRates,
    });
    expect(result).toMatchObject({ ok: true, breakdown: { exitNetCents: 0, exitTotalCents: 0 } });
  });

  it('is floored at zero: an exit never pays money back', () => {
    // Paid absurdly much relative to the re-price (tiny used months on a long contract cannot
    // produce this, so simulate with a large paid amount).
    const result = earlyExitQuote({
      contract: ainoContract,
      usedMonths: 2,
      paidNetCents: 300_000,
      exitDate: '2027-01-04',
      table,
      vatRates,
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.breakdown.exitNetCents).toBe(0);
  });

  it('rejects impossible month counts', () => {
    const base = {
      contract: ainoContract,
      paidNetCents: 0,
      exitDate: '2027-01-04',
      table,
      vatRates,
    };
    expect(earlyExitQuote({ ...base, usedMonths: 0 })).toEqual({
      ok: false,
      reason: 'bad_used_months',
    });
    expect(earlyExitQuote({ ...base, usedMonths: 37 })).toEqual({
      ok: false,
      reason: 'bad_used_months',
    });
  });
});
