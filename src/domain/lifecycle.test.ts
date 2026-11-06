import { beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadRefurbishmentCosts } from '@/data/load';
import type { Asset, RefurbishmentCosts } from '@/data/schemas';
import {
  endLeaseReadiness,
  maintenanceAfterWork,
  mayEndLease,
  missingReadinessTasks,
  refurbishmentPlan,
} from './lifecycle';

let assets: Asset[];
let costs: RefurbishmentCosts;
beforeAll(async () => {
  [assets, costs] = await Promise.all([loadAssets(), loadRefurbishmentCosts()]);
});

const prerequisites = {
  status: 'active',
  endDate: '2029-11-05',
  onDate: '2029-11-05',
  termMonths: 36,
  rentalInvoiceCount: 36,
};
const end = {
  ...prerequisites,
  choice: 'return' as const,
  customerId: 'a',
  previousUsageValue: 1200,
  usageValue: 1500,
};

describe('endLeaseReadiness', () => {
  it('is ready at maturity with every rent invoice issued, without inspection inputs', () => {
    expect(endLeaseReadiness(prerequisites)).toEqual({ ok: true });
    expect(
      endLeaseReadiness({ ...prerequisites, latestInvoiceDate: prerequisites.onDate })
    ).toEqual({ ok: true });
  });

  it.each([
    [{ status: 'bought' }, 'not_active'],
    [{ status: 'returned' }, 'not_active'],
    [{ status: 'passed_on' }, 'not_active'],
    [{ onDate: '2029-11-04' }, 'too_early'],
    [{ latestInvoiceDate: '2029-11-06' }, 'too_early'],
    [{ rentalInvoiceCount: 35 }, 'invoices_missing'],
    [{ rentalInvoiceCount: 37 }, 'invoices_missing'],
  ])('blocks unavailable end choices for %o', (change, reason) => {
    expect(endLeaseReadiness({ ...prerequisites, ...change })).toEqual({ ok: false, reason });
  });

  it('becomes ready on the latest invoice date after late issuance', () => {
    expect(
      endLeaseReadiness({
        ...prerequisites,
        onDate: '2029-11-10',
        latestInvoiceDate: '2029-11-10',
      })
    ).toEqual({ ok: true });
  });
});

describe('mayEndLease', () => {
  it.each(['buy', 'return', 'pass_on'] as const)(
    'allows %s only after maturity and complete issuance',
    (choice) => {
      expect(mayEndLease({ ...end, choice, nextCustomerId: 'b' })).toEqual({ ok: true });
    }
  );
  it.each([
    [{ status: 'returned' }, 'not_active'],
    [{ onDate: '2029-11-04' }, 'too_early'],
    [{ latestInvoiceDate: '2029-11-06' }, 'too_early'],
    [{ rentalInvoiceCount: 35 }, 'invoices_missing'],
    [{ rentalInvoiceCount: 37 }, 'invoices_missing'],
    [{ usageValue: 1199 }, 'usage_decreased'],
    [{ choice: 'pass_on' as const }, 'invalid_successor'],
    [{ choice: 'pass_on' as const, nextCustomerId: '' }, 'invalid_successor'],
    [{ choice: 'pass_on' as const, nextCustomerId: 'a' }, 'invalid_successor'],
  ])('rejects an invalid transition %o', (change, reason) => {
    expect(mayEndLease({ ...end, ...change })).toEqual({ ok: false, reason });
  });

  it('accepts equal meter readings and a closure on the latest invoice date', () => {
    expect(mayEndLease({ ...end, usageValue: 1200, latestInvoiceDate: '2029-11-05' })).toEqual({
      ok: true,
    });
    expect(mayEndLease({ ...end, onDate: '2029-11-06' })).toEqual({ ok: true });
  });

  it('does not require a new inspection reading to buy the item', () => {
    expect(mayEndLease({ ...end, choice: 'buy', usageValue: 0 })).toEqual({ ok: true });
  });

  it.each(['return', 'pass_on'] as const)('still rejects a lower reading for %s', (choice) => {
    expect(mayEndLease({ ...end, choice, usageValue: 0, nextCustomerId: 'b' })).toEqual({
      ok: false,
      reason: 'usage_decreased',
    });
  });

  it.each([
    [{ status: 'bought' }, 'not_active'],
    [{ onDate: '2029-11-04' }, 'too_early'],
    [{ latestInvoiceDate: '2029-11-06' }, 'too_early'],
    [{ rentalInvoiceCount: 35 }, 'invoices_missing'],
  ])('keeps readiness requirements for a buyout with %o', (change, reason) => {
    expect(mayEndLease({ ...end, ...change, choice: 'buy', usageValue: 0 })).toEqual({
      ok: false,
      reason,
    });
  });

  it('does not treat an early return as normal term completion', () => {
    expect(mayEndLease({ ...end, onDate: '2027-06-05', rentalInvoiceCount: 7 })).toEqual({
      ok: false,
      reason: 'too_early',
    });
  });

  it('returns the first failing rule in the documented priority order', () => {
    const invalid = {
      ...end,
      status: 'returned',
      onDate: '2029-11-04',
      rentalInvoiceCount: 35,
      usageValue: 1199,
      choice: 'pass_on' as const,
    };
    expect(mayEndLease(invalid)).toEqual({ ok: false, reason: 'not_active' });
    expect(mayEndLease({ ...invalid, status: 'active' })).toEqual({
      ok: false,
      reason: 'too_early',
    });
    expect(mayEndLease({ ...invalid, status: 'active', onDate: end.onDate })).toEqual({
      ok: false,
      reason: 'invoices_missing',
    });
    expect(
      mayEndLease({ ...invalid, status: 'active', onDate: end.onDate, rentalInvoiceCount: 36 })
    ).toEqual({ ok: false, reason: 'usage_decreased' });
  });
});

describe('readiness boundaries and service evidence', () => {
  it.each(['fair', 'poor'] as const)(
    'rejects target %s under the chosen readiness policy',
    (targetCondition) => {
      expect(refurbishmentPlan({ asset: asset('ebike-007'), targetCondition, costs })).toEqual({
        ok: false,
        reason: 'condition_too_low',
      });
    }
  );

  it('adds every priced improvement through like_new without changing the asset', () => {
    const current = structuredClone(asset('ebike-007'));
    Object.freeze(current.usage);
    Object.freeze(current);
    const plan = refurbishmentPlan({ asset: current, targetCondition: 'like_new', costs });
    expect(plan).toEqual({
      ok: true,
      totalNetCents: 59500,
      tasks: [
        { id: 'upgrade:fair->good', netCostCents: 12000, units: 1, resetsUsage: false },
        { id: 'upgrade:good->like_new', netCostCents: 8000, units: 1, resetsUsage: false },
        { id: 'battery_replacement', netCostCents: 35000, units: 1, resetsUsage: true },
        { id: 'safety_inspection', netCostCents: 4500, units: 1, resetsUsage: false },
      ],
    });
    expect(current).toEqual(asset('ebike-007'));
  });

  it.each([
    ['ebike-007', 14999, false],
    ['ebike-007', 15000, true],
    ['laptop-001', 499, false],
    ['laptop-001', 500, true],
  ] as const)('checks the inclusive battery threshold for %s at %i', (id, value, required) => {
    const current = {
      ...asset(id),
      condition: 'good' as const,
      usage: { ...asset(id).usage, value },
    };
    const plan = refurbishmentPlan({ asset: current, targetCondition: 'good', costs });
    expect(plan.ok).toBe(true);
    if (plan.ok)
      expect(plan.tasks.some((task) => task.id === 'battery_replacement')).toBe(required);
  });

  it.each([-1, 0.5, 18401, NaN, Infinity])(
    'rejects an invalid battery baseline: %s',
    (baseline) => {
      expect(
        refurbishmentPlan({
          asset: asset('ebike-007'),
          targetCondition: 'good',
          costs,
          maintenance: { batteryReplacementAtUsage: baseline },
        })
      ).toEqual({ ok: false, reason: 'missing_service_history' });
    }
  );

  it.each([
    { usage: 500, units: 0, total: 40000 },
    { usage: 501, units: 1, total: 190000 },
    { usage: 1499, units: 1, total: 190000 },
    { usage: 1500, units: 1, total: 190000 },
    { usage: 1501, units: 2, total: 340000 },
  ])('counts started service intervals at $usage engine hours', ({ usage, units, total }) => {
    const current = {
      ...asset('farm-002'),
      usage: { unit: 'engine_hours' as const, value: usage },
    };
    const plan = refurbishmentPlan({
      asset: current,
      targetCondition: 'good',
      costs,
      lastServiceUsage: 500,
    });
    expect(plan).toMatchObject({ ok: true, totalNetCents: total });
    if (plan.ok) {
      expect(plan.tasks.find((task) => task.id === 'major_service')).toEqual(
        units === 0
          ? undefined
          : { id: 'major_service', units, netCostCents: units * 150000, resetsUsage: false }
      );
    }
  });

  it.each([-1, 0.5, 1502, NaN, Infinity])(
    'rejects an invalid service reading: %s',
    (lastServiceUsage) => {
      const current = {
        ...asset('farm-002'),
        usage: { unit: 'engine_hours' as const, value: 1501 },
      };
      expect(
        refurbishmentPlan({ asset: current, targetCondition: 'good', costs, lastServiceUsage })
      ).toEqual({ ok: false, reason: 'missing_service_history' });
    }
  );

  it('uses a saved service baseline ahead of the supplied fallback, including zero', () => {
    const current = { ...asset('farm-002'), usage: { unit: 'engine_hours' as const, value: 1501 } };
    expect(
      refurbishmentPlan({
        asset: current,
        targetCondition: 'good',
        costs,
        lastServiceUsage: 1501,
        maintenance: { lastServiceAtUsage: 0 },
      })
    ).toMatchObject({ ok: true, totalNetCents: 340000 });
    expect(
      refurbishmentPlan({
        asset: current,
        targetCondition: 'good',
        costs,
        lastServiceUsage: 0,
        maintenance: { lastServiceAtUsage: 1502 },
      })
    ).toEqual({ ok: false, reason: 'missing_service_history' });
  });

  it('rejects service rules that use a different meter unit', () => {
    const changed = structuredClone(costs);
    changed.e_bike.fixed[0]!.when = 'usage.value >= 500 battery_cycles';
    expect(
      refurbishmentPlan({ asset: asset('ebike-007'), targetCondition: 'good', costs: changed })
    ).toEqual({ ok: false, reason: 'unsupported_service_rule' });
    changed.e_bike.fixed[0]!.when = 'per started 1000 engine_hours since last service';
    expect(
      refurbishmentPlan({
        asset: asset('ebike-007'),
        targetCondition: 'good',
        costs: changed,
        lastServiceUsage: 0,
      })
    ).toEqual({ ok: false, reason: 'missing_service_history' });
  });

  it('requires a mandatory task even below its usage threshold', () => {
    const changed = structuredClone(costs);
    changed.laptop.fixed[1]!.mandatory_before_next_lease = true;
    const plan = refurbishmentPlan({
      asset: asset('laptop-001'),
      targetCondition: 'good',
      costs: changed,
    });
    expect(plan).toMatchObject({ ok: true, totalNetCents: 11500 });
    if (plan.ok)
      expect(plan.tasks.find((task) => task.id === 'battery_replacement')?.units).toBe(1);
  });

  it('uses the cumulative meter for a threshold that does not reset usage', () => {
    const changed = structuredClone(costs);
    changed.e_bike.fixed = [
      { id: 'inspection', cost_cents: 1000, when: 'usage.value >= 15000 km' },
    ];
    const current = { ...asset('ebike-007'), condition: 'good' as const };
    expect(
      refurbishmentPlan({
        asset: current,
        targetCondition: 'good',
        costs: changed,
        maintenance: { batteryReplacementAtUsage: 18400 },
      })
    ).toEqual({
      ok: true,
      totalNetCents: 1000,
      tasks: [{ id: 'inspection', netCostCents: 1000, units: 1, resetsUsage: false }],
    });
  });
});

describe('refurbishment cost arithmetic', () => {
  it('allows a zero-priced upgrade without treating it as a missing transition', () => {
    const changed = structuredClone(costs);
    changed.e_bike.condition_upgrades['fair->good'] = 0;
    expect(
      refurbishmentPlan({ asset: asset('ebike-007'), targetCondition: 'good', costs: changed })
    ).toMatchObject({
      ok: true,
      totalNetCents: 39500,
      tasks: [
        { id: 'upgrade:fair->good', netCostCents: 0 },
        { id: 'battery_replacement' },
        { id: 'safety_inspection' },
      ],
    });
  });

  it.each([-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid upgrade cost: %s',
    (cost) => {
      const changed = structuredClone(costs);
      changed.e_bike.condition_upgrades['fair->good'] = cost;
      expect(() =>
        refurbishmentPlan({ asset: asset('ebike-007'), targetCondition: 'good', costs: changed })
      ).toThrow(RangeError);
    }
  );

  it('rejects overflowing work-unit costs', () => {
    const changed = structuredClone(costs);
    changed.farm_machine.fixed[0]!.cost_cents = Number.MAX_SAFE_INTEGER;
    const current = { ...asset('farm-002'), usage: { unit: 'engine_hours' as const, value: 1001 } };
    expect(() =>
      refurbishmentPlan({
        asset: current,
        targetCondition: 'good',
        costs: changed,
        lastServiceUsage: 0,
      })
    ).toThrow(RangeError);
  });

  it('allows the maximum safe total but rejects a sum one cent above it', () => {
    const changed = structuredClone(costs);
    changed.e_bike.fixed = [
      { id: 'inspection', cost_cents: Number.MAX_SAFE_INTEGER - 12000, when: 'always' },
    ];
    expect(
      refurbishmentPlan({ asset: asset('ebike-007'), targetCondition: 'good', costs: changed })
    ).toMatchObject({ ok: true, totalNetCents: Number.MAX_SAFE_INTEGER });
    changed.e_bike.fixed[0]!.cost_cents += 1;
    expect(() =>
      refurbishmentPlan({ asset: asset('ebike-007'), targetCondition: 'good', costs: changed })
    ).toThrow(RangeError);
  });
});

function asset(id: string) {
  const found = assets.find((item) => item.id === id);
  if (!found) throw new Error('Fixture missing');
  return found;
}

describe('refurbishmentPlan', () => {
  it('requires the upgrade, battery and inspection for the worn returned e-bike', () => {
    const plan = refurbishmentPlan({ asset: asset('ebike-007'), targetCondition: 'good', costs });
    expect(plan).toEqual({
      ok: true,
      totalNetCents: 51500,
      tasks: [
        { id: 'upgrade:fair->good', netCostCents: 12000, units: 1, resetsUsage: false },
        { id: 'battery_replacement', netCostCents: 35000, units: 1, resetsUsage: true },
        { id: 'safety_inspection', netCostCents: 4500, units: 1, resetsUsage: false },
      ],
    });
  });
  it('keeps a laptop wipe mandatory below the battery threshold', () => {
    const plan = refurbishmentPlan({ asset: asset('laptop-001'), targetCondition: 'good', costs });
    expect(plan).toMatchObject({
      ok: true,
      totalNetCents: 2500,
      tasks: [{ id: 'certified_data_wipe' }],
    });
  });
  it('includes every condition step and the exact battery threshold', () => {
    const laptop = {
      ...asset('laptop-001'),
      condition: 'poor' as const,
      usage: { unit: 'battery_cycles' as const, value: 500 },
    };
    expect(refurbishmentPlan({ asset: laptop, targetCondition: 'good', costs })).toMatchObject({
      ok: true,
      totalNetCents: 28000,
    });
  });
  it('requires an evidenced service meter and counts each started interval', () => {
    const farm = { ...asset('farm-002'), usage: { unit: 'engine_hours' as const, value: 1501 } };
    expect(refurbishmentPlan({ asset: farm, targetCondition: 'good', costs })).toEqual({
      ok: false,
      reason: 'missing_service_history',
    });
    expect(
      refurbishmentPlan({ asset: farm, targetCondition: 'good', costs, lastServiceUsage: 500 })
    ).toMatchObject({ ok: true, totalNetCents: 340000 });
    expect(
      refurbishmentPlan({ asset: farm, targetCondition: 'good', costs, lastServiceUsage: 1501 })
    ).toMatchObject({ ok: true, totalNetCents: 40000 });
  });
  it('does not invent unsupported repairs or interpret arbitrary prose', () => {
    expect(
      refurbishmentPlan({ asset: asset('ebike-007'), targetCondition: 'fair', costs })
    ).toEqual({ ok: false, reason: 'condition_too_low' });
    expect(refurbishmentPlan({ asset: asset('ebike-007'), targetCondition: 'new', costs })).toEqual(
      { ok: false, reason: 'unsupported_upgrade' }
    );
    const changed = structuredClone(costs);
    changed.e_bike.fixed[0]!.when = 'unknown rule';
    expect(
      refurbishmentPlan({ asset: asset('ebike-007'), targetCondition: 'good', costs: changed })
    ).toEqual({ ok: false, reason: 'unsupported_service_rule' });
  });
  it.each([
    ['ebike-007', 18400, undefined, true],
    ['ebike-007', 18500, 18400, false],
    ['ebike-007', 33400, 18400, true],
    ['laptop-001', 500, undefined, true],
    ['laptop-001', 501, 500, false],
    ['laptop-001', 1000, 500, true],
  ] as const)(
    'uses the meter since battery replacement: %s %i %s',
    (id, value, baseline, replacement) => {
      const current = {
        ...asset(id),
        condition: 'good' as const,
        usage: { ...asset(id).usage, value },
      };
      const plan = refurbishmentPlan({
        asset: current,
        targetCondition: 'good',
        costs,
        maintenance: baseline === undefined ? {} : { batteryReplacementAtUsage: baseline },
      });
      expect(plan.ok).toBe(true);
      if (plan.ok)
        expect(plan.tasks.some((task) => task.id === 'battery_replacement')).toBe(replacement);
    }
  );
});

it('reports missing completion evidence without duplicate or unrelated tasks changing it', () => {
  const tasks = [{ id: 'wipe', netCostCents: 2500, units: 1, resetsUsage: false }];
  expect(missingReadinessTasks(tasks, ['inspection'])).toEqual(['wipe']);
  expect(missingReadinessTasks(tasks, ['wipe', 'wipe'])).toEqual([]);
});

it('moves only the performed maintenance baselines and preserves the previous record', () => {
  const previous = { batteryReplacementAtUsage: 1000, lastServiceAtUsage: 800 };
  const task = { id: 'battery_replacement', netCostCents: 35000, units: 1, resetsUsage: true };
  expect(maintenanceAfterWork({ previous, tasks: [task], usageValue: 18400 })).toEqual({
    batteryReplacementAtUsage: 18400,
    lastServiceAtUsage: 800,
  });
  expect(previous).toEqual({ batteryReplacementAtUsage: 1000, lastServiceAtUsage: 800 });
  expect(
    maintenanceAfterWork({ previous: {}, tasks: [], usageValue: 1500, lastServiceUsage: 1000 })
  ).toEqual({ lastServiceAtUsage: 1000 });
  expect(
    maintenanceAfterWork({ previous, tasks: [{ ...task, id: 'major_service' }], usageValue: 1500 })
  ).toEqual({ batteryReplacementAtUsage: 1000, lastServiceAtUsage: 1500 });
});

it('preserves missing-task order and handles an empty plan without modifying inputs', () => {
  const tasks = Object.freeze([
    { id: 'battery_replacement', netCostCents: 35000, units: 1, resetsUsage: true },
    { id: 'safety_inspection', netCostCents: 4500, units: 1, resetsUsage: false },
  ]);
  const completed = Object.freeze(['unrelated', 'unrelated']);
  expect(missingReadinessTasks(tasks, completed)).toEqual([
    'battery_replacement',
    'safety_inspection',
  ]);
  expect(missingReadinessTasks(tasks, ['safety_inspection'])).toEqual(['battery_replacement']);
  expect(missingReadinessTasks([], completed)).toEqual([]);
});

it('copies unchanged baselines and never overwrites a recorded zero with a fallback', () => {
  const previous = Object.freeze({ lastServiceAtUsage: 0, batteryReplacementAtUsage: 500 });
  const result = maintenanceAfterWork({
    previous,
    tasks: [],
    usageValue: 1500,
    lastServiceUsage: 1000,
  });
  expect(result).toEqual(previous);
  expect(result).not.toBe(previous);
  expect(maintenanceAfterWork({ previous: {}, tasks: [], usageValue: 1500 })).toEqual({});
});

it('records both completed maintenance operations at the current cumulative reading', () => {
  const previous = Object.freeze({ lastServiceAtUsage: 1000, batteryReplacementAtUsage: 500 });
  const tasks = [
    { id: 'battery_replacement', netCostCents: 35000, units: 1, resetsUsage: true },
    { id: 'major_service', netCostCents: 150000, units: 1, resetsUsage: false },
  ];
  expect(maintenanceAfterWork({ previous, tasks, usageValue: 18400 })).toEqual({
    lastServiceAtUsage: 18400,
    batteryReplacementAtUsage: 18400,
  });
  expect(previous).toEqual({ lastServiceAtUsage: 1000, batteryReplacementAtUsage: 500 });
});
