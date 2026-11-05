import { beforeAll, describe, expect, it } from 'vitest';
import { loadRefurbishmentCosts } from '@/data/load';
import type { RefurbishmentCosts } from '@/data/schemas';
import { leasableTargetFor, refurbishPlan, type ReturnedItem } from './refurbishment';

let costs: RefurbishmentCosts;
beforeAll(async () => {
  costs = await loadRefurbishmentCosts();
});

// Card 9: ebike-007 came back in fair condition with 18 400 km (data/assets.json).
const ebike007: ReturnedItem = {
  category: 'e_bike',
  condition: 'fair',
  usage: { unit: 'km', value: 18_400 },
};

describe('leasableTargetFor', () => {
  it('serves a fair-accepting entry as fair, never worse (refurbishment-costs.json note)', () => {
    expect(leasableTargetFor('fair')).toBe('fair');
    expect(leasableTargetFor('poor')).toBe('fair');
  });

  it('keeps any stricter minimum as it is', () => {
    expect(leasableTargetFor('good')).toBe('good');
    expect(leasableTargetFor('like_new')).toBe('like_new');
    expect(leasableTargetFor('new')).toBe('new');
  });
});

describe('refurbishPlan', () => {
  it('card 9 kept fair: new battery (18 400 >= 15 000 km) and safety inspection', () => {
    // 35 000 battery + 4 500 inspection = 39 500. The battery resets usage to 0.
    expect(refurbishPlan(costs, ebike007, 'fair')).toEqual({
      ok: true,
      steps: [
        { id: 'battery_replacement', kind: 'fixed', quantity: 1, costCents: 35_000 },
        { id: 'safety_inspection', kind: 'fixed', quantity: 1, costCents: 4_500 },
      ],
      totalCents: 39_500,
      upgradeCents: 0,
      conditionAfter: 'fair',
      usageAfter: { unit: 'km', value: 0 },
    });
  });

  it('card 9 brought to good: the same fixed costs plus fair->good 12 000', () => {
    // 35 000 + 4 500 + 12 000 = 51 500.
    const plan = refurbishPlan(costs, ebike007, 'good');
    expect(plan).toMatchObject({
      ok: true,
      totalCents: 51_500,
      upgradeCents: 12_000,
      conditionAfter: 'good',
    });
    expect(plan.ok && plan.steps.at(-1)).toEqual({
      id: 'fair->good',
      kind: 'upgrade',
      quantity: 1,
      costCents: 12_000,
    });
  });

  it('chains upgrades one step at a time: poor -> good on an e-bike is 15 000 + 12 000', () => {
    const plan = refurbishPlan(
      costs,
      { ...ebike007, condition: 'poor', usage: { unit: 'km', value: 500 } },
      'good'
    );
    // No battery under 15 000 km: 4 500 inspection + 15 000 + 12 000 = 31 500.
    expect(plan).toMatchObject({ ok: true, totalCents: 31_500, upgradeCents: 27_000 });
    expect(plan.ok && plan.usageAfter).toEqual({ unit: 'km', value: 500 });
  });

  it('replaces the battery from exactly 15 000 km, not at 14 999', () => {
    const at = (value: number) =>
      refurbishPlan(costs, { ...ebike007, usage: { unit: 'km', value } }, 'fair');
    expect(at(15_000)).toMatchObject({ totalCents: 39_500 }); // 35 000 + 4 500
    expect(at(14_999)).toMatchObject({ totalCents: 4_500, usageAfter: { value: 14_999 } });
  });

  it('never downgrades: a like_new item for a fair-accepting entry stays like_new', () => {
    const plan = refurbishPlan(costs, { ...ebike007, condition: 'like_new' }, 'fair');
    expect(plan).toMatchObject({ ok: true, upgradeCents: 0, conditionAfter: 'like_new' });
  });

  it('cannot reach new: the data has no like_new->new step', () => {
    expect(refurbishPlan(costs, ebike007, 'new')).toEqual({
      ok: false,
      reason: 'condition_unreachable',
    });
  });

  it('laptop: data wipe always, battery from 500 cycles (laptop-007, fair, 780 cycles)', () => {
    const plan = refurbishPlan(
      costs,
      { category: 'laptop', condition: 'fair', usage: { unit: 'battery_cycles', value: 780 } },
      'good'
    );
    // 2 500 wipe + 9 000 battery + 7 500 fair->good = 19 000.
    expect(plan).toMatchObject({ ok: true, totalCents: 19_000, usageAfter: { value: 0 } });
  });

  it('farm: a major service per started 1 000 engine hours (farm-005, 4 200 h, never serviced)', () => {
    const plan = refurbishPlan(
      costs,
      {
        category: 'farm_machine',
        condition: 'good',
        usage: { unit: 'engine_hours', value: 4_200 },
      },
      'good'
    );
    // ceil(4 200 / 1 000) = 5 services × 150 000 = 750 000, + 40 000 inspection = 790 000.
    expect(plan).toMatchObject({ ok: true, totalCents: 790_000, upgradeCents: 0 });
    expect(plan.ok && plan.steps[0]).toEqual({
      id: 'major_service',
      kind: 'fixed',
      quantity: 5,
      costCents: 750_000,
    });
    // Exactly 1 000 h is one started thousand; 0 h needs no service.
    const hours = (value: number) =>
      refurbishPlan(
        costs,
        { category: 'farm_machine', condition: 'good', usage: { unit: 'engine_hours', value } },
        'good'
      );
    expect(hours(1_000)).toMatchObject({ totalCents: 190_000 }); // 150 000 + 40 000
    expect(hours(0)).toMatchObject({ totalCents: 40_000 });
  });

  it('refuses a rule it cannot read, rather than guessing a cost', () => {
    const odd: RefurbishmentCosts = {
      ...costs,
      e_bike: { ...costs.e_bike, fixed: [{ id: 'x', cost_cents: 1, when: 'on Tuesdays' }] },
    };
    expect(() => refurbishPlan(odd, ebike007, 'fair')).toThrow(/on Tuesdays/);
  });

  it('refuses a usage reading in the wrong unit', () => {
    expect(() =>
      refurbishPlan(
        costs,
        { ...ebike007, usage: { unit: 'battery_cycles', value: 20_000 } },
        'fair'
      )
    ).toThrow(/unit/);
  });
});
