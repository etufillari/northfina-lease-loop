// Card 9, second life: `ebike-007` comes back fair at 18 400 km. The refurbishment plan and
// the waiting-list match are in src/domain/second-life; the harness pins the facts the card
// rests on, and the assessment and the match pin the judged numbers.
import { describe, expect, it } from 'vitest';
import refurbishmentJson from '../../../data/refurbishment-costs.json';
import residualJson from '../../../data/residual-curves.json';
import { refurbishmentCostsSchema, residualCurvesSchema } from '@/data/schemas';
import { refurbishmentPlan } from '../refurbishment/plan';
import { marketValueCents } from '../residual/market-value';
import { assessReturn, firstLeaseListPriceCents } from '../second-life/assess';
import { matchDemand } from '../second-life/match';
import { assetById, pack, pricing } from './fixtures';

const entry = (id: string) => pack.demand.find((d) => d.id === id);

describe('card 9: second life (ebike-007, fair, 18 400 km)', () => {
  it('ebike-007 is returned, fair, 18 400 km, after one life', () => {
    expect(assetById('ebike-007')).toMatchObject({
      status: 'returned',
      condition: 'fair',
      usage: { unit: 'km', value: 18_400 },
      previous_lives: 1,
    });
  });

  it('wait-02 takes fair at 12 months, wait-13 needs good at 24, both up to 9 000 net', () => {
    expect(entry('wait-02')).toMatchObject({
      category: 'e_bike',
      min_condition: 'fair',
      preferred_term_months: 12,
      max_monthly_net_rent_cents: 9_000,
    });
    expect(entry('wait-13')).toMatchObject({
      category: 'e_bike',
      min_condition: 'good',
      preferred_term_months: 24,
      max_monthly_net_rent_cents: 9_000,
    });
  });

  it('the refurbishment plan to good: battery 35 000 (usage reset), inspection 4 500, 12 000 more', () => {
    const plan = refurbishmentPlan(
      {
        category: 'e_bike',
        condition: 'fair',
        usage: { unit: 'km', value: 18_400 },
        targetCondition: 'good',
      },
      refurbishmentCostsSchema.parse(refurbishmentJson)
    );
    expect(plan.steps.map((s) => [s.id, s.costCents])).toEqual([
      ['battery_replacement', 35_000],
      ['safety_inspection', 4_500],
      ['fair->good', 12_000],
    ]);
    expect([plan.fixedCents, plan.upgradeCents, plan.totalCents]).toEqual([39_500, 12_000, 51_500]);
    // D83: the odometer keeps its 18 400 km, the usage since the battery is 0.
    expect(plan.usageAfter).toEqual({ unit: 'km', value: 18_400 });
    expect(plan.usageSinceResetAfter).toEqual({ unit: 'km', value: 0 });
    expect(plan.conditionAfter).toBe('good');
  });

  // The judged flow: the assessment (D12) and the match (D13, D61) on the pack.
  const assessed = assessReturn(
    {
      assetId: 'ebike-007',
      category: 'e_bike',
      condition: 'fair',
      usage: { unit: 'km', value: 18_400 },
      age: { modelYear: 2023, previousLives: 1, leaseStart: '2023-01-01' },
      newPriceCents: firstLeaseListPriceCents(pricing.priceLists, 'ebike-007')!,
      isoDate: '2026-11-06',
    },
    {
      curves: residualCurvesSchema.parse(residualJson),
      costs: refurbishmentCostsSchema.parse(refurbishmentJson),
      pricing,
    }
  );
  const match = matchDemand(assessed, pack.demand);
  const option = (c: string) => assessed.options.find((o) => o.condition === c)!;

  it('the battery is replaced (35 000, over 15 000 km): the usage since it resets, the total stays', () => {
    const battery = option('fair').plan.steps.find((s) => s.id === 'battery_replacement');
    expect(battery).toMatchObject({ costCents: 35_000, resetsUsage: true });
    expect(option('fair').plan.usageSinceResetAfter.value).toBe(0);
    expect(option('fair').plan.usageAfter.value).toBe(18_400);
  });

  it("the organisers' three numbers (D83): 92 781 before the battery, 115 976 after, 151 661 good", () => {
    // 549 000 × 32.5 % × 0.65 × 0.80 (the −20 % cap) = 92 781, before the battery.
    expect(
      marketValueCents(
        {
          listPriceCents: 549_000,
          category: 'e_bike',
          ageMonths: assessed.ageMonths,
          condition: 'fair',
          usage: { unit: 'km', value: 18_400 },
        },
        residualCurvesSchema.parse(residualJson)
      ).valueCents
    ).toBe(92_781);
    // × 1.00 with the new battery: 115 976; and fair → good, × 0.85: 151 661.
    expect(option('fair').marketValue.valueCents).toBe(115_976);
    expect(option('good').marketValue.valueCents).toBe(151_661);
  });

  it('the safety inspection 4 500 is always charged', () => {
    for (const o of assessed.options) {
      expect(o.plan.steps.find((s) => s.id === 'safety_inspection')?.costCents).toBe(4_500);
    }
  });

  it('fair to good costs 12 000 more', () => {
    expect(option('good').plan.totalCents - option('fair').plan.totalCents).toBe(12_000);
  });

  it('as is, it matches wait-02 (fair, 12 months, up to 9 000): 115 976 financed, 6 497 a month', () => {
    // D86: the price is the market value, 549 000 × 32.5 % (46 months) × 0.65 × 1.00 = 115 976
    // (band A), nothing added; × 0.056022 = 6 497.20 → 6 497, under wait-02's 9 000.
    expect(option('fair').secondLifeFinancedCents).toBe(115_976);
    expect(match.winner).toMatchObject({
      demandId: 'wait-02',
      condition: 'fair',
      upgrade: false,
      termMonths: 12,
      monthlyNetCents: 6_497,
    });
    expect(match.decision.code).toBe('relist_for_winner');
    expect(match.relist.condition).toBe('fair');
  });

  it('refurbished to good, it matches wait-13 (good, 24 months, up to 9 000) and ranks second', () => {
    // 549 000 × 32.5 % × 0.85 × 1.00 = 151 661 (band A); × 0.036637 = 5 556.40 → 5 556.
    expect(option('good').secondLifeFinancedCents).toBe(151_661);
    expect(match.ranking[1]).toMatchObject({
      demandId: 'wait-13',
      condition: 'good',
      upgrade: true,
      monthlyNetCents: 5_556,
      decidedBy: 'no_refurbishment',
    });
  });

  it("the twins: D13's first step still decides, wait-02 takes it as returned", () => {
    expect(match.ranking.map((r) => [r.demandId, r.decidedBy])).toEqual([
      ['wait-02', null],
      ['wait-13', 'no_refurbishment'],
      ['wait-03', 'needed_by'],
      ['wait-04', 'needed_by'],
    ]);
  });

  it('refurbish or not: good gains 35 685 for 12 000 more, worth it, but nobody needs it', () => {
    expect(option('good').comparison).toMatchObject({
      valueGainCents: 35_685,
      extraCostCents: 12_000,
      worthIt: true,
    });
    // The winner takes it fair, so the item is relisted as returned (D61 kept for a winner).
    expect(match.relist.plan.totalCents).toBe(39_500);
  });
});
