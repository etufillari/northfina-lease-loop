import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadCoefficientTable,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadSecondLifeDemand,
} from '@/data/load';
import type {
  CoefficientTable,
  RefurbishmentCosts,
  ResidualCurves,
  SecondLifeRequest,
} from '@/data/schemas';
import { quoteLease } from './pricing';
import {
  ageInMonths,
  leasableCondition,
  marketValueCents,
  rankWaitingList,
  refurbishmentPlan,
  residualPercent,
  roundToEuros,
  usagePercent,
} from './second-life';

let curves: ResidualCurves;
let costs: RefurbishmentCosts;
let demand: SecondLifeRequest[];
let table: CoefficientTable;
beforeAll(async () => {
  [curves, costs, demand, table] = await Promise.all([
    loadResidualCurves(),
    loadRefurbishmentCosts(),
    loadSecondLifeDemand(),
    loadCoefficientTable(),
  ]);
});

const TODAY = '2026-11-06';

describe('residualPercent', () => {
  it('interpolates linearly between points and holds the ends', () => {
    const ebike = curves.curves.e_bike ?? [];
    expect(residualPercent(ebike, 0)).toBe(100);
    expect(residualPercent(ebike, 3)).toBe(91); // halfway from 100 to 82
    expect(residualPercent(ebike, 40)).toBe(37); // 36 → 40, 48 → 31
    expect(residualPercent(ebike, 120)).toBe(25); // beyond the last point
  });
});

describe('ageInMonths and usagePercent', () => {
  it('counts from 1 July of the model year', () => {
    expect(ageInMonths(2023, TODAY)).toBe(40);
    expect(ageInMonths(2026, '2026-03-01')).toBe(0);
  });

  it('loses value per full step of usage, up to the cap', () => {
    expect(usagePercent(curves, 'e_bike', 999)).toBe(-0);
    expect(usagePercent(curves, 'e_bike', 9_800)).toBe(-18); // 9 full steps × −2 %
    expect(usagePercent(curves, 'e_bike', 18_400)).toBe(-20); // capped at −20 %
  });
});

describe('refurbishmentPlan', () => {
  it('card 9: ebike-007 (fair, 18,400 km) needs a new battery and a safety check', () => {
    const plan = refurbishmentPlan(
      { category: 'e_bike', before: 'fair', after: 'fair', usage: 18_400 },
      costs
    );
    expect(plan).toEqual({
      ok: true,
      steps: [
        { id: 'battery_replacement', costCents: 35_000, reason: 'usage', resetsUsage: true },
        { id: 'safety_inspection', costCents: 4_500, reason: 'always', resetsUsage: false },
      ],
      costCents: 39_500,
      usageAfter: 0,
    });
  });

  it('adds one upgrade per condition step', () => {
    const plan = refurbishmentPlan(
      { category: 'e_bike', before: 'poor', after: 'like_new', usage: 0 },
      costs
    );
    expect(plan.ok && plan.steps.filter((s) => s.reason === 'upgrade').map((s) => s.id)).toEqual([
      'poor->fair',
      'fair->good',
      'good->like_new',
    ]);
    expect(plan.ok && plan.costCents).toBe(15_000 + 12_000 + 8_000 + 4_500);
  });

  it('always wipes a laptop’s data, as required before the next lease', () => {
    const plan = refurbishmentPlan(
      { category: 'laptop', before: 'good', after: 'good', usage: 310 },
      costs
    );
    expect(plan.ok && plan.steps).toEqual([
      { id: 'certified_data_wipe', costCents: 2_500, reason: 'mandatory', resetsUsage: false },
    ]);
  });

  it('services a farm machine once per started 1,000 engine hours', () => {
    const plan = refurbishmentPlan(
      { category: 'farm_machine', before: 'good', after: 'good', usage: 4_200 },
      costs
    );
    expect(plan.ok && plan.steps.find((s) => s.id === 'major_service')?.costCents).toBe(
      5 * 150_000
    );
  });

  it('refuses a downgrade, and refurbishing to “new”', () => {
    expect(
      refurbishmentPlan({ category: 'e_bike', before: 'good', after: 'fair', usage: 0 }, costs)
    ).toEqual({ ok: false, reason: 'cannot_downgrade' });
    expect(
      refurbishmentPlan({ category: 'e_bike', before: 'like_new', after: 'new', usage: 0 }, costs)
    ).toEqual({ ok: false, reason: 'cannot_reach_new' });
  });
});

describe('marketValueCents and the second-life price', () => {
  // ebike-007: list 549000 when new, model year 2023 → 40 months → 37 % on the curve
  const ebike007 = (condition: 'fair' | 'good', usage: number) =>
    marketValueCents(
      { originalNetCents: 549_000, category: 'e_bike', ageMonths: 40, condition, usage },
      curves
    );

  it('values it by age, condition and usage', () => {
    expect(ebike007('fair', 18_400)).toBe(105_628); // × 37 % × 0.65 × (1 − 20 %)
    expect(ebike007('fair', 0)).toBe(132_035); // 132034.5 → half up; a new battery removes the usage penalty
    expect(ebike007('good', 0)).toBe(172_661); // 172660.5 → half up
  });

  it('suggests a price in whole euros', () => {
    expect(roundToEuros(132_035)).toBe(132_000);
    expect(roundToEuros(172_661)).toBe(172_700);
  });
});

describe('leasableCondition', () => {
  it('needs good or better, or fair when someone waiting accepts fair', () => {
    expect(leasableCondition('good', 'e_bike', demand, TODAY)).toBe(true);
    expect(leasableCondition('fair', 'e_bike', demand, TODAY)).toBe(true); // wait-02 accepts fair
    expect(leasableCondition('poor', 'e_bike', demand, TODAY)).toBe(false);
    expect(leasableCondition('fair', 'e_bike', demand, '2027-06-01')).toBe(false); // deadline gone
  });
});

describe('rankWaitingList (card 9: wait-02 or wait-13?)', () => {
  const monthlyFor = (priceCents: number) => (termMonths: number) => {
    const result = quoteLease(
      { listPriceCents: priceCents, downPaymentCents: 0, termMonths, vatPercent: 25.5 },
      table
    );
    return result.ok ? result.quote.monthlyNetCents : null;
  };

  it('kept fair (€1,320): only wait-02, who accepts fair, gets it', () => {
    const ranked = rankWaitingList(
      { category: 'e_bike', condition: 'fair' },
      monthlyFor(132_000),
      demand,
      TODAY
    );
    expect(ranked.filter((r) => r.fits).map((r) => r.request.id)).toEqual(['wait-02']);
    expect(ranked.find((r) => r.request.id === 'wait-13')?.problems).toEqual(['condition']);
  });

  it('refurbished to good (€1,727): wait-13 fits; wait-02’s 12 months is over budget', () => {
    const ranked = rankWaitingList(
      { category: 'e_bike', condition: 'good' },
      monthlyFor(172_700),
      demand,
      TODAY
    );
    const fits = ranked.filter((r) => r.fits).map((r) => r.request.id);
    expect(fits[0]).toBe('wait-13');
    expect(ranked.find((r) => r.request.id === 'wait-02')?.problems).toEqual(['budget']);
  });

  it('breaks a tie by who signed up first (wait-06 before wait-14)', () => {
    const ranked = rankWaitingList(
      { category: 'laptop', condition: 'good' },
      () => 2_000,
      demand,
      TODAY
    );
    const ids = ranked.map((r) => r.request.id);
    expect(ids.indexOf('wait-06')).toBeLessThan(ids.indexOf('wait-14'));
  });

  it('puts people whose deadline has passed last, with the reason', () => {
    const ranked = rankWaitingList(
      { category: 'laptop', condition: 'good' },
      () => 1_000,
      demand,
      '2026-11-13'
    );
    expect(ranked.find((r) => r.request.id === 'wait-09')?.problems).toContain('deadline');
  });
});
