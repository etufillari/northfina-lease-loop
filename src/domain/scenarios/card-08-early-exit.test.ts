// Card 8, early exit: card 1's contract ends after month 7 (2027-06-05). The schedule and the
// balance (D14), the market value by the residual curve (D31, provisional: a first-life item is
// aged from its lease start), the early-exit price line by line and its invoice's VAT.
// src/server/scenarios/card-01-08.test.ts runs the same card through the services.
import { describe, expect, it } from 'vitest';
import refurbishmentJson from '../../../data/refurbishment-costs.json';
import residualCurvesJson from '../../../data/residual-curves.json';
import { refurbishmentCostsSchema, residualCurvesSchema } from '@/data/schemas';
import { earlyExitCost, exitBilling, type EarlyExitInput } from '../exits';
import {
  amortisationTolerance,
  buildSchedule,
  outstandingBalanceAfter,
  scheduleTotals,
} from '../invoicing';
import { curveAgeInMonths } from '../residual/age';
import { marketValueCents } from '../residual/market-value';
import { pack, quoteFor } from './fixtures';

const curves = residualCurvesSchema.parse(residualCurvesJson);
const costs = refurbishmentCostsSchema.parse(refurbishmentJson);
const EXIT_DAY = '2027-06-05';

const deal = { assetId: 'ebike-003', termMonths: 36, isoDate: '2026-11-05' };
const MONTHS_PAID = 7;

function contract() {
  const q = quoteFor(deal);
  if (!q.ok) throw new Error(q.reason.code);
  const s = buildSchedule({
    signedOn: deal.isoDate,
    startDate: deal.isoDate,
    termMonths: 36,
    downPaymentCents: 0,
    monthlyNetCents: q.quote.monthlyNetCents,
    vatRates: pack.vatRates,
  });
  if (!s.ok) throw new Error(s.reason);
  const band = pack.table.bands.find((b) => b.band === q.quote.band)!;
  return {
    quote: q.quote,
    invoices: s.invoices,
    annualInterestPercent: band.annual_interest_percent,
  };
}

describe('card 8: early exit (card 1 at month 7)', () => {
  it('the 29 rents not yet billed come to 311 170 net', () => {
    const { invoices } = contract();
    const remaining = invoices.filter((i) => i.sequence > MONTHS_PAID);
    expect(remaining).toHaveLength(29);
    expect(scheduleTotals(remaining).netCents).toBe(311_170);
  });

  it('the buyout at the end of the term is 58 350', () => {
    expect(contract().quote.buyoutCents).toBe(58_350);
    // The remaining rents plus the buyout, 369 520, are more than the balance: interest not earned.
    expect(311_170 + 58_350).toBe(369_520);
  });

  it('the balance by D14 after 7 rents is 330 675, line by line', () => {
    const { quote, annualInterestPercent } = contract();
    const balance = outstandingBalanceAfter(
      {
        financedCents: quote.financedCents,
        annualInterestPercent,
        monthlyNetCents: quote.monthlyNetCents,
        termMonths: quote.termMonths,
        buyoutCents: quote.buyoutCents,
      },
      MONTHS_PAID
    );
    expect(annualInterestPercent).toBe(7.9);
    expect(balance.balanceCents).toBe(330_675);
    expect(balance.rows).toHaveLength(7);
    expect(balance.rows.at(-1)?.closingCents).toBe(330_675);
    expect(Math.abs(balance.driftCents)).toBeLessThanOrEqual(amortisationTolerance(389_000, 36));
  });

  it('the market value by the residual curve at month 7 is 311 200 as new, 259 230 good at 1 800 km (D31)', () => {
    const { quote } = contract();
    const age = curveAgeInMonths(
      { modelYear: 2026, previousLives: 0, leaseStart: deal.isoDate },
      EXIT_DAY
    );
    expect(age).toBe(7);
    const value = (condition: 'new' | 'good', km: number) =>
      marketValueCents(
        {
          listPriceCents: quote.unitListPriceCents,
          category: 'e_bike',
          ageMonths: age,
          condition,
          usage: { unit: 'km', value: km },
        },
        curves
      );
    expect(value('new', 0)).toMatchObject({ valueCents: 311_200, curvePercent: 80 });
    expect(value('good', 1_800).valueCents).toBe(259_230);
  });

  it('the early-exit price is the D14 balance 330 675 to buy, 75 945 to return, line by line', () => {
    const cost = earlyExitCost(exitInput(MONTHS_PAID, EXIT_DAY));
    expect(cost.buy.totalCents).toBe(330_675);
    expect(cost.buy.lines.map((l) => l.code)).toEqual([
      'months_paid',
      'balance',
      'remaining_rents',
      'buyout_at_end',
      'total',
    ]);
    expect(cost.return.totalCents).toBe(75_945);
    expect(cost.return.lines.find((l) => l.code === 'market_value')?.params).toMatchObject({
      amountCents: 259_230,
    });
    expect(cost.return.lines.at(-1)).toMatchObject({
      code: 'total',
      params: { amountCents: 75_945 },
    });
  });

  it('the early-exit invoice carries the VAT rate of its own day: 26 % in June 2027, 25.5 % in December 2026', () => {
    const bill = (paid: number, today: string) =>
      exitBilling({
        mode: 'buy',
        cost: earlyExitCost(exitInput(paid, today)),
        today,
        invoices: [],
        vatRates: pack.vatRates,
      });
    expect(bill(MONTHS_PAID, EXIT_DAY)).toMatchObject({
      ok: true,
      invoice: {
        kind: 'early_exit',
        netCents: 330_675,
        vatRateBasisPoints: 2_600,
        vatCents: 85_976,
        grossCents: 416_651,
      },
    });
    const december = bill(1, '2026-12-05');
    expect(december.ok && december.invoice?.vatRateBasisPoints).toBe(2_550);
  });
});

/** Card 1's contract as the exit reads it, `paid` rents paid, Aino reporting good at 1 800 km. */
function exitInput(paid: number, today: string): EarlyExitInput {
  const { quote, annualInterestPercent } = contract();
  return {
    contract: {
      financedCents: quote.financedCents,
      monthlyNetCents: quote.monthlyNetCents,
      termMonths: quote.termMonths,
      buyoutCents: quote.buyoutCents,
      startDate: deal.isoDate,
      endDate: '2029-11-04',
      unitListPriceCents: quote.unitListPriceCents,
      quantity: 1,
    },
    annualInterestPercent,
    invoices: Array.from({ length: 36 }, (_, i) => ({
      kind: 'rent' as const,
      status: i < paid ? ('paid' as const) : ('issued' as const),
    })),
    today,
    asset: { category: 'e_bike' },
    curve: {
      listPriceCents: quote.unitListPriceCents,
      age: { modelYear: 2026, previousLives: 0, leaseStart: deal.isoDate },
    },
    reported: { condition: 'good', usage: { unit: 'km', value: 1_800 } },
    curves,
    costs,
  };
}
