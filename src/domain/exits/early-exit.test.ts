// D14: the cost of leaving, on top of invoicing's outstandingBalanceAfter. Card 8 is card 1
// (ebike-003, 36 months, no down payment, from 2026-11-05) ended in month 7 after 7 paid rents.
import { describe, expect, it } from 'vitest';
import refurbishmentJson from '../../../data/refurbishment-costs.json';
import residualCurvesJson from '../../../data/residual-curves.json';
import { refurbishmentCostsSchema, residualCurvesSchema } from '@/data/schemas';
import { earlyExitCost, type EarlyExitInput } from './early-exit';

const curves = residualCurvesSchema.parse(residualCurvesJson);
const costs = refurbishmentCostsSchema.parse(refurbishmentJson);

function rents(paid: number, term = 36) {
  return Array.from({ length: term }, (_, i) => ({
    kind: 'rent' as const,
    status: i < paid ? ('paid' as const) : ('issued' as const),
  }));
}

/** Card 1's contract; Aino reports "good" and 1 800 km (this test's assumption). */
function card8(overrides: Partial<EarlyExitInput> = {}): EarlyExitInput {
  return {
    contract: {
      financedCents: 389_000,
      monthlyNetCents: 10_730,
      termMonths: 36,
      buyoutCents: 58_350,
      endDate: '2029-11-04',
      startDate: '2026-11-05',
      unitListPriceCents: 389_000,
      quantity: 1,
    },
    annualInterestPercent: 7.9,
    invoices: rents(7),
    today: '2027-06-05', // month 7 complete: the 8th period starts, unpaid
    asset: { category: 'e_bike' },
    curve: {
      listPriceCents: 389_000,
      age: { modelYear: 2026, previousLives: 0, leaseStart: '2026-11-05' },
    },
    reported: { condition: 'good', usage: { unit: 'km', value: 1_800 } },
    curves,
    costs,
    ...overrides,
  };
}

describe('earlyExitCost, card 8 (card 1 ended in month 7)', () => {
  const cost = earlyExitCost(card8());

  it('counts the 7 paid rents and takes the D14 balance 330 675', () => {
    expect(cost.atOrAfterEnd).toBe(false);
    expect(cost.monthsPaid).toBe(7);
    expect(cost.balanceCents).toBe(330_675);
    expect(cost.balanceRows).toHaveLength(7);
  });

  it('buy = the balance, with the 29 remaining rents 311 170 and the buyout 58 350 beside it', () => {
    expect(cost.buy.totalCents).toBe(330_675);
    expect(cost.buy.lines).toEqual([
      { code: 'months_paid', effect: 'info', params: { months: 7, termMonths: 36 } },
      { code: 'balance', effect: 'add', params: { months: 7, amountCents: 330_675 } },
      { code: 'remaining_rents', effect: 'info', params: { months: 29, amountCents: 311_170 } },
      { code: 'buyout_at_end', effect: 'info', params: { amountCents: 58_350 } },
      { code: 'total', effect: 'total', params: { amountCents: 330_675 } },
    ]);
    expect(cost.remainingRentsNetCents).toBe(311_170);
  });

  it('D90: pass on = 330 675 − 259 230 = 71 445, no refurbishment line; the return keeps 4 500', () => {
    expect(cost.passOn.totalCents).toBe(71_445);
    expect(cost.passOn.lines.map((l) => l.code)).not.toContain('refurb_fixed');
    expect(cost.passOn.lines.map((l) => l.code)).not.toContain('refurb_upgrade');
    expect(cost.passOn.lines.at(-2)).toEqual({
      code: 'refurb_waived',
      effect: 'add',
      params: { amountCents: 0 },
    });
    expect(cost.return.lines.map((l) => l.code)).toContain('refurb_fixed');
    expect(cost.return.totalCents - cost.passOn.totalCents).toBe(4_500);
  });

  it('return = 330 675 − market value 259 230 + safety inspection 4 500 = 75 945', () => {
    // D31 (provisional): a first-life item is aged from its lease start, 7 months, 80 % on the
    // curve. 389 000 × 80 % × 0.85 (good) × 0.98 (1 800 km) = 259 229.6 → 259 230.
    // By D11 for every item (17 months, 62.5 %) it would be 202 523, the return 132 652.
    expect(cost.marketValue.valueCents).toBe(259_230);
    expect(cost.return.totalCents).toBe(75_945);
    expect(cost.return.lines.map((l) => [l.code, l.params.amountCents])).toEqual([
      ['months_paid', undefined],
      ['balance', 330_675],
      ['market_value', 259_230],
      ['balance_after_value', 71_445],
      ['refurb_fixed', 4_500],
      ['total', 75_945],
    ]);
    expect(cost.return.lines[2]!.params).toMatchObject({
      ageMonths: 7,
      curvePercent: 80,
      condition: 'good',
      conditionMultiplier: 0.85,
      usageAdjustmentPercent: -2,
    });
  });

  it("as new with no km the market value is the brief's 311 200 and the return 23 975", () => {
    const asNew = earlyExitCost(
      card8({ reported: { condition: 'new', usage: { unit: 'km', value: 0 } } })
    );
    expect(asNew.marketValue.valueCents).toBe(311_200);
    expect(asNew.return.totalCents).toBe(330_675 - 311_200 + 4_500);
  });
});

describe('earlyExitCost, the rules around it', () => {
  it('never below zero: a market value above the balance leaves only the refurbishment', () => {
    const late = earlyExitCost(
      card8({
        invoices: rents(35),
        today: '2029-10-10',
        reported: { condition: 'new', usage: { unit: 'km', value: 0 } },
      })
    );
    expect(late.marketValue.valueCents).toBeGreaterThan(late.balanceCents);
    const codes = late.return.lines.map((l) => l.code);
    expect(codes).toContain('value_exceeds_balance');
    expect(
      late.return.lines.find((l) => l.code === 'balance_after_value')!.params.amountCents
    ).toBe(0);
    expect(late.return.totalCents).toBe(4_500);
  });

  it('on the end date the buy is the frozen buyout and the return only the refurbishment', () => {
    const end = earlyExitCost(
      card8({
        invoices: rents(36),
        today: '2029-11-04',
        reported: { condition: 'fair', usage: { unit: 'km', value: 16_000 } },
      })
    );
    expect(end.atOrAfterEnd).toBe(true);
    expect(end.buy.totalCents).toBe(58_350);
    expect(end.buy.lines.map((l) => l.code)).toEqual(['buyout', 'total']);
    // battery 35 000 (over 15 000 km) + inspection 4 500 + fair->good 12 000
    expect(end.return.totalCents).toBe(51_500);
    expect(end.return.lines.map((l) => l.code)).toEqual([
      'refurb_fixed',
      'refurb_fixed',
      'refurb_upgrade',
      'total',
    ]);
  });

  it('a battery replaced at 18 400 km (D83): the value counts the km since, the battery is not due again', () => {
    const relisted = (usageAtLastReset?: number) =>
      earlyExitCost(
        card8({
          reported: { condition: 'good', usage: { unit: 'km', value: 20_200 } },
          usageAtLastReset,
        })
      );
    // None on record: 20 200 km is −20 % (the cap) and the battery is due.
    expect(relisted().marketValue.usageAdjustmentPercent).toBe(-20);
    expect(relisted().refurbishment.steps.map((s) => s.id)).toContain('battery_replacement');
    // 1 800 km since the battery: one step of −2 %, as card 8; no battery, only the inspection.
    const since = relisted(18_400);
    expect(since.marketValue.valueCents).toBe(259_230);
    expect(since.refurbishment.steps.map((s) => s.id)).toEqual(['safety_inspection']);
  });

  it('a rent paid in advance counts; a down payment does not; paid rents cap at the term', () => {
    const withDown = earlyExitCost(
      card8({ invoices: [{ kind: 'down_payment', status: 'paid' }, ...rents(7)] })
    );
    expect(withDown.monthsPaid).toBe(7);
    const tooMany = earlyExitCost(card8({ invoices: rents(40, 40), today: '2029-11-01' }));
    expect(tooMany.monthsPaid).toBe(36);
  });

  it('nothing paid yet: the balance is the financed amount', () => {
    const first = earlyExitCost(card8({ invoices: rents(0), today: '2026-11-05' }));
    expect(first.balanceCents).toBe(389_000);
    expect(first.buy.totalCents).toBe(389_000);
  });

  it('a quantity multiplies the market value and the refurbishment, not the balance', () => {
    const one = earlyExitCost(card8());
    const two = earlyExitCost(
      card8({
        contract: {
          ...card8().contract,
          quantity: 2,
          financedCents: 778_000,
          monthlyNetCents: 21_460,
        },
      })
    );
    const mv = (c: typeof one) => c.return.lines.find((l) => l.code === 'market_value')!;
    expect(mv(two).params.amountCents).toBe(2 * (mv(one).params.amountCents as number));
  });
});

describe('earlyExitCost, a relisted item (review finding 1, card 9)', () => {
  it('values ebike-007 from D60 (549 000, 58 months), not its second-life price 172 829: 121 329', () => {
    const cost = earlyExitCost(
      card8({
        contract: { ...card8().contract, startDate: '2026-11-06', unitListPriceCents: 172_829 },
        today: '2027-11-06',
        curve: {
          listPriceCents: 549_000,
          age: { modelYear: 2023, previousLives: 1, leaseStart: '2026-11-06' },
        },
        reported: { condition: 'good', usage: { unit: 'km', value: 0 } },
      })
    );
    expect(cost.marketValue.ageMonths).toBe(58);
    expect(cost.marketValue.valueCents).toBe(121_329);
  });
});
