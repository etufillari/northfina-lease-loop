// What it costs to bring a returned item to a target condition, read from
// data/refurbishment-costs.json: the fixed steps whose `when` holds, then the condition
// upgrades in order. Card 9 pins ebike-007.
import { describe, expect, it } from 'vitest';
import refurbishmentJson from '../../../data/refurbishment-costs.json';
import { refurbishmentCostsSchema, type RefurbishmentCosts } from '@/data/schemas';
import {
  parseWhenRule,
  refurbishmentPlan,
  usageAtLastReset,
  usageAtLastService,
  usageSinceReset,
} from './plan';

const costs = refurbishmentCostsSchema.parse(refurbishmentJson);
const km = (value: number) => ({ unit: 'km' as const, value });

describe('parseWhenRule', () => {
  it('reads always, a usage threshold and the per-started-block rule from the data', () => {
    expect(parseWhenRule('always')).toEqual({ kind: 'always' });
    expect(parseWhenRule('usage.value >= 15000 km')).toEqual({
      kind: 'usage_at_least',
      value: 15_000,
      unit: 'km',
    });
    expect(parseWhenRule('per started 1000 engine_hours since last service')).toEqual({
      kind: 'per_started',
      block: 1_000,
      unit: 'engine_hours',
    });
  });

  it('a rule it does not know is a thrown error, not a silent skip', () => {
    expect(() => parseWhenRule('when it rains')).toThrow(/unknown refurbishment rule/);
    expect(() => parseWhenRule('usage.value >= 15000 miles')).toThrow(/unknown/);
  });
});

describe('refurbishmentPlan', () => {
  it('card 9: ebike-007 fair at 18 400 km to good is 35 000 + 4 500 + 12 000', () => {
    const plan = refurbishmentPlan(
      { category: 'e_bike', condition: 'fair', usage: km(18_400), targetCondition: 'good' },
      costs
    );
    expect(plan.steps).toEqual([
      {
        kind: 'fixed',
        id: 'battery_replacement',
        costCents: 35_000,
        resetsUsage: true,
        quantity: 1,
      },
      { kind: 'fixed', id: 'safety_inspection', costCents: 4_500, resetsUsage: false, quantity: 1 },
      { kind: 'upgrade', id: 'fair->good', from: 'fair', to: 'good', costCents: 12_000 },
    ]);
    expect(plan.fixedCents).toBe(39_500);
    expect(plan.upgradeCents).toBe(12_000);
    expect(plan.totalCents).toBe(51_500);
    // D83, the organisers' answer of 6 Nov: the total never resets, the usage since the battery does.
    expect(plan.usageAfter).toEqual(km(18_400));
    expect(plan.usageSinceResetAfter).toEqual(km(0));
    expect(plan.conditionAfter).toBe('good');
  });

  it('card 9: kept fair (a waiting-list entry accepts fair), only the fixed steps: 39 500', () => {
    const plan = refurbishmentPlan(
      { category: 'e_bike', condition: 'fair', usage: km(18_400), targetCondition: 'fair' },
      costs
    );
    expect(plan.totalCents).toBe(39_500);
    expect(plan.conditionAfter).toBe('fair');
  });

  it('at 14 999 km the battery is not replaced and the usage stays', () => {
    const plan = refurbishmentPlan(
      { category: 'e_bike', condition: 'good', usage: km(14_999), targetCondition: 'good' },
      costs
    );
    expect(plan.steps.map((s) => s.id)).toEqual(['safety_inspection']);
    expect(plan.usageAfter).toEqual(km(14_999));
    expect(plan.usageSinceResetAfter).toEqual(km(14_999));
    expect(plan.totalCents).toBe(4_500);
  });

  // D83, the organisers' answer of 6 Nov: the next replacement counts the usage since the last one.
  const ebikeAt = (total: number, usageAtLastReset?: number) =>
    refurbishmentPlan(
      {
        category: 'e_bike',
        condition: 'good',
        usage: km(total),
        usageAtLastReset,
        targetCondition: 'good',
      },
      costs
    );

  it('the next battery is due at 15 000 km since the last one, not on the total (D83)', () => {
    const early = ebikeAt(30_000, 18_400);
    expect(early.steps.map((s) => s.id)).toEqual(['safety_inspection']);
    expect(early.usageAfter).toEqual(km(30_000));
    expect(early.usageSinceResetAfter).toEqual(km(11_600));
    const due = ebikeAt(33_400, 18_400);
    expect(due.steps.map((s) => s.id)).toEqual(['battery_replacement', 'safety_inspection']);
    expect(due.usageAfter).toEqual(km(33_400));
    expect(due.usageSinceResetAfter).toEqual(km(0));
  });

  it('a laptop battery is due at 500 cycles since the last one (D83)', () => {
    const laptop = (value: number, usageAtLastReset: number) =>
      refurbishmentPlan(
        {
          category: 'laptop',
          condition: 'good',
          usage: { unit: 'battery_cycles', value },
          usageAtLastReset,
          targetCondition: 'good',
        },
        costs
      ).steps.map((s) => s.id);
    expect(laptop(899, 400)).toEqual(['certified_data_wipe']);
    expect(laptop(900, 400)).toEqual(['certified_data_wipe', 'battery_replacement']);
  });

  it('a last reset above the counter (a replaced meter) counts from 0, never negative', () => {
    const plan = ebikeAt(5_000, 18_400);
    expect(plan.steps.map((s) => s.id)).toEqual(['safety_inspection']);
    expect(plan.usageSinceResetAfter).toEqual(km(5_000));
  });

  it('upgrades step by step in order: poor to good is poor->fair then fair->good', () => {
    const plan = refurbishmentPlan(
      {
        category: 'laptop',
        condition: 'poor',
        usage: { unit: 'battery_cycles', value: 120 },
        targetCondition: 'good',
      },
      costs
    );
    expect(plan.steps.map((s) => s.id)).toEqual([
      'certified_data_wipe',
      'poor->fair',
      'fair->good',
    ]);
    expect(plan.totalCents).toBe(2_500 + 9_000 + 7_500);
  });

  it('an item already better than the target is not downgraded', () => {
    const plan = refurbishmentPlan(
      { category: 'e_bike', condition: 'like_new', usage: km(100), targetCondition: 'good' },
      costs
    );
    expect(plan.upgradeCents).toBe(0);
    expect(plan.conditionAfter).toBe('like_new');
  });

  it('a farm machine pays one major service per started 1 000 engine hours', () => {
    const plan = refurbishmentPlan(
      {
        category: 'farm_machine',
        condition: 'good',
        usage: { unit: 'engine_hours', value: 2_001 },
        targetCondition: 'good',
      },
      costs
    );
    expect(plan.steps[0]).toEqual({
      kind: 'fixed',
      id: 'major_service',
      costCents: 450_000,
      resetsUsage: false,
      quantity: 3,
    });
    expect(plan.totalCents).toBe(450_000 + 40_000);
  });

  it('farm-005 returned a second time at 4 500 h, serviced at 4 200 h: one major service, not five (review finding 7)', () => {
    const farm = (usageAtLastService?: number) =>
      refurbishmentPlan(
        {
          category: 'farm_machine',
          condition: 'good',
          usage: { unit: 'engine_hours', value: 4_500 },
          usageAtLastService,
          targetCondition: 'good',
        },
        costs
      ).steps.find((step) => step.id === 'major_service');
    expect(farm()).toMatchObject({ quantity: 5, costCents: 750_000 });
    expect(farm(4_200)).toMatchObject({ quantity: 1, costCents: 150_000 });
    // Not a block started since the service: no major service at all.
    expect(farm(4_500)).toBeUndefined();
  });

  it('a last service above the counter (a replaced meter) counts from 0, never negative', () => {
    const plan = refurbishmentPlan(
      {
        category: 'farm_machine',
        condition: 'good',
        usage: { unit: 'engine_hours', value: 300 },
        usageAtLastService: 4_200,
        targetCondition: 'good',
      },
      costs
    );
    expect(plan.steps.find((step) => step.id === 'major_service')).toMatchObject({ quantity: 1 });
  });

  it('a target the data has no upgrade for (like_new to new) throws', () => {
    expect(() =>
      refurbishmentPlan(
        { category: 'e_bike', condition: 'like_new', usage: km(0), targetCondition: 'new' },
        costs
      )
    ).toThrow(/no upgrade like_new->new/);
  });

  it('an unknown when rule in the data throws for every item of that category', () => {
    const broken: RefurbishmentCosts = {
      ...costs,
      e_bike: { ...costs.e_bike, fixed: [{ id: 'x', cost_cents: 1, when: 'sometimes' }] },
    };
    expect(() =>
      refurbishmentPlan(
        { category: 'e_bike', condition: 'good', usage: km(0), targetCondition: 'good' },
        broken
      )
    ).toThrow(/unknown refurbishment rule/);
  });

  it('a usage unit that is not the rule unit throws', () => {
    expect(() =>
      refurbishmentPlan(
        {
          category: 'e_bike',
          condition: 'good',
          usage: { unit: 'engine_hours', value: 1 },
          targetCondition: 'good',
        },
        costs
      )
    ).toThrow(RangeError);
  });
});

describe('usageAtLastService', () => {
  it('the newest assessment that did a major service gives the hours; none gives 0', () => {
    const history = [
      { usageValue: 4_600, stepIds: ['safety_inspection'] },
      { usageValue: 4_200, stepIds: ['major_service', 'safety_inspection'] },
      { usageValue: 1_000, stepIds: ['major_service'] },
    ];
    expect(usageAtLastService(history, 'farm_machine', costs)).toBe(4_200);
    expect(usageAtLastService([], 'farm_machine', costs)).toBe(0);
    // An e-bike has no per-block step: its battery is a threshold rule.
    expect(usageAtLastService(history, 'e_bike', costs)).toBe(0);
  });
});

describe('usageSinceReset (D83)', () => {
  it('is the total less the reading at the last reset; none on record is the total', () => {
    expect(usageSinceReset(18_400)).toBe(18_400);
    expect(usageSinceReset(18_400, 18_400)).toBe(0);
    expect(usageSinceReset(30_000, 18_400)).toBe(11_600);
    // A counter below the reading (a replaced meter) counts from 0.
    expect(usageSinceReset(5_000, 18_400)).toBe(5_000);
  });
});

describe('usageAtLastReset (D83)', () => {
  it('the newest assessment that replaced the battery gives the reading; none gives 0', () => {
    const history = [
      { usageValue: 30_000, stepIds: ['safety_inspection'] },
      { usageValue: 18_400, stepIds: ['battery_replacement', 'safety_inspection'] },
      { usageValue: 16_000, stepIds: ['battery_replacement'] },
    ];
    expect(usageAtLastReset(history, 'e_bike', costs)).toBe(18_400);
    expect(usageAtLastReset([], 'e_bike', costs)).toBe(0);
    // A farm machine has no step that resets usage.
    expect(usageAtLastReset(history, 'farm_machine', costs)).toBe(0);
  });
});
