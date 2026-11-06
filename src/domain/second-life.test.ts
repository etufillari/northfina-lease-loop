import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadAssets,
  loadCoefficientTable,
  loadPriceLists,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadSecondLifeDemand,
} from '@/data/load';
import type {
  Asset,
  CoefficientTable,
  PriceList,
  RefurbishmentCosts,
  ResidualCurves,
  SecondLifeRequest,
} from '@/data/schemas';
import { listPriceOn } from './price-list';
import {
  matchWaitingList,
  meetsMinCondition,
  requiredRefurbishments,
  secondLifeDecision,
} from './second-life';

let assets: Asset[];
let table: CoefficientTable;
let priceLists: PriceList[];
let costs: RefurbishmentCosts;
let curves: ResidualCurves;
let demand: SecondLifeRequest[];
beforeAll(async () => {
  [assets, table, priceLists, costs, curves, demand] = await Promise.all([
    loadAssets(),
    loadCoefficientTable(),
    loadPriceLists(),
    loadRefurbishmentCosts(),
    loadResidualCurves(),
    loadSecondLifeDemand(),
  ]);
});

function v1Price(assetId: string): number {
  const price = listPriceOn(priceLists, assetId, '2026-01-01');
  if (!price.ok) throw new Error(`no v1 price for ${assetId}`);
  return price.priceCents;
}

describe('meetsMinCondition', () => {
  it('orders conditions from poor up to new', () => {
    expect(meetsMinCondition('fair', 'fair')).toBe(true);
    expect(meetsMinCondition('good', 'fair')).toBe(true);
    expect(meetsMinCondition('fair', 'good')).toBe(false);
  });
});

describe('requiredRefurbishments', () => {
  it('a worn e-bike needs a new battery (usage resets) and the safety inspection', () => {
    const ebike007 = assets.find((a) => a.id === 'ebike-007')!;
    const result = requiredRefurbishments(ebike007, costs);
    expect(result.items.map((i) => i.id).sort()).toEqual([
      'battery_replacement',
      'safety_inspection',
    ]);
    expect(result.totalCents).toBe(39_500);
    expect(result.resetsUsage).toBe(true);
  });

  it('a lightly used laptop needs only the mandatory data wipe', () => {
    const laptop009 = assets.find((a) => a.id === 'laptop-009')!; // 45 cycles
    const result = requiredRefurbishments(laptop009, costs);
    expect(result.items.map((i) => i.id)).toEqual(['certified_data_wipe']);
    expect(result.resetsUsage).toBe(false);
  });
});

describe('matchWaitingList', () => {
  it('first come, first served: wait-06 beats the identical wait-14 by one day', () => {
    const result = matchWaitingList(
      { category: 'laptop', condition: 'good', financedCents: 65_000, asOfDate: '2026-11-05' },
      demand,
      table
    );
    expect(result.winner?.id).toBe('wait-06');
    const wait14 = result.considered.find((c) => c.id === 'wait-14');
    expect(wait14?.outcome).toBe('lost_first_come_first_served');
  });

  it('gives every candidate a reason', () => {
    const result = matchWaitingList(
      { category: 'laptop', condition: 'good', financedCents: 65_000, asOfDate: '2026-11-05' },
      demand,
      table
    );
    const byId = Object.fromEntries(result.considered.map((c) => [c.id, c.outcome]));
    expect(byId['wait-07']).toBe('condition_below_minimum'); // wants like_new
    expect(byId['wait-08']).toBe('over_budget'); // €18.61 rent against an €18 budget
    expect(byId['wait-09']).toBe('lost_first_come_first_served');
  });

  it('drops entries whose deadline has passed on the as-of date', () => {
    const result = matchWaitingList(
      { category: 'laptop', condition: 'good', financedCents: 65_000, asOfDate: '2026-11-16' },
      demand,
      table
    );
    // Every laptop waiter except wait-07 is past their deadline by 16 Nov, and wait-07
    // insists on like_new — so a good laptop finds nobody.
    expect(result.winner).toBeNull();
    const byId = Object.fromEntries(result.considered.map((c) => [c.id, c.outcome]));
    expect(byId['wait-06']).toBe('deadline_passed');
    expect(byId['wait-09']).toBe('deadline_passed');
    expect(byId['wait-07']).toBe('condition_below_minimum');
  });
});

describe('secondLifeDecision', () => {
  it('scenario card 9: ebike-007 goes to wait-02 as-is — fair is accepted, so no upgrade', () => {
    const ebike007 = assets.find((a) => a.id === 'ebike-007')!;
    const decision = secondLifeDecision(
      { asset: ebike007, originalListPriceCents: v1Price('ebike-007'), asOfDate: '2026-11-05' },
      { curves, costs, demand, table }
    );
    // Battery (18 400 km ≥ 15 000) and safety inspection are still done; usage resets to 0.
    expect(decision.requiredTotalCents).toBe(39_500);
    expect(decision.usageAfterRefurb).toBe(0);
    expect(decision.upgrade).toBeNull();
    expect(decision.action).toBe('lease_to_waiter');
    expect(decision.winnerId).toBe('wait-02');
    // wait-13 wants at least 'good', so the fair bike never reaches them.
    const wait13 = decision.considered.find((c) => c.id === 'wait-13');
    expect(wait13?.outcome).toBe('condition_below_minimum');
  });

  it('scenario card 10: ebike-008 (third life) is decidable without crashing', () => {
    const ebike008 = assets.find((a) => a.id === 'ebike-008')!;
    expect(ebike008.previous_lives).toBe(2);
    const decision = secondLifeDecision(
      { asset: ebike008, originalListPriceCents: v1Price('ebike-008'), asOfDate: '2026-11-05' },
      { curves, costs, demand, table }
    );
    expect(['lease_to_waiter', 'list_available', 'parts_bin']).toContain(decision.action);
    expect(decision.financedCents).toBeGreaterThan(0);
  });

  it('sends a worthless item to the parts bin', () => {
    const ebike007 = assets.find((a) => a.id === 'ebike-007')!;
    const decision = secondLifeDecision(
      // Poor condition, cheap, and by February 2027 every e-bike waiter's deadline has
      // passed — one upgrade still leaves it below 'good', so it cannot be listed.
      {
        asset: { ...ebike007, condition: 'poor' },
        originalListPriceCents: 40_000,
        asOfDate: '2027-02-01',
      },
      { curves, costs, demand, table }
    );
    expect(decision.action).toBe('parts_bin');
  });

  it('prices at market value after the work: the new battery is not charged twice', () => {
    const ebike007 = assets.find((a) => a.id === 'ebike-007')!;
    const decision = secondLifeDecision(
      { asset: ebike007, originalListPriceCents: v1Price('ebike-007'), asOfDate: '2026-11-05' },
      { curves, costs, demand, table }
    );
    // As returned (18 400 km, usage factor 0.80) it is worth less than with a new battery.
    expect(decision.valueAsReturnedCents).toBe(92_781);
    expect(decision.valueAsIsCents).toBe(115_976);
    // The customer pays the value with the new battery; Northfina pays the €395 of work.
    expect(decision.financedCents).toBe(decision.valueFinalCents);
    expect(decision.financedCents).toBe(115_976);
    expect(decision.workTotalCents).toBe(39_500);
  });
});

describe('secondLifeDecision: an upgrade must pay for itself', () => {
  const decide = (assetId: string, overrides: Partial<Asset>, price: number, waiting = demand) =>
    secondLifeDecision(
      {
        asset: { ...assets.find((a) => a.id === assetId)!, ...overrides },
        originalListPriceCents: price,
        asOfDate: '2026-11-05',
      },
      { curves, costs, demand: waiting, table }
    );

  it('a good item nobody takes becomes like-new when the value it adds beats its cost', () => {
    // ebike-011: €1,781.43 as good; like-new adds ~€210 for an €80 upgrade.
    const decision = decide('ebike-011', {}, v1Price('ebike-011'), []);
    expect(decision.action).toBe('list_available');
    expect(decision.upgrade).toMatchObject({
      from: 'good',
      to: 'like_new',
      reason: 'pays_for_itself',
    });
    expect(decision.valueFinalCents - decision.valueAsIsCents).toBeGreaterThan(8000);
    expect(decision.workTotalCents).toBe(decision.requiredTotalCents + 8000);
  });

  it('a good item stays good when the upgrade would cost more than it adds', () => {
    // ebike-008: €326.01 as good; like-new would add ~€38 for an €80 upgrade.
    const decision = decide('ebike-008', {}, v1Price('ebike-008'), []);
    expect(decision.action).toBe('list_available');
    expect(decision.upgrade).toBeNull();
    expect(decision.financedCents).toBe(32_601);
  });

  it('upgrades an item that is worth too little to lease, when the upgrade lifts it over €300', () => {
    // laptop-006: €275.77 as good, under the €300 minimum; like-new (€50) makes it €308.21.
    const decision = decide('laptop-006', {}, v1Price('laptop-006'), []);
    expect(decision.valueAsIsCents).toBeLessThan(30_000);
    expect(decision.action).toBe('list_available');
    expect(decision.upgrade).toMatchObject({ to: 'like_new', reason: 'reach_listing' });
    expect(decision.financedCents).toBeGreaterThanOrEqual(30_000);
  });

  it('upgrades a fair item for the next waiter who needs good, when it pays for its work', () => {
    const decision = decide(
      'laptop-007',
      {},
      v1Price('laptop-007'),
      demand.filter((w) => w.id !== 'wait-08')
    );
    expect(decision.upgrade).toMatchObject({ from: 'fair', to: 'good', reason: 'serve_waiter' });
    expect(decision.action).toBe('lease_to_waiter');
    expect(decision.winnerId).toBe('wait-06');
    expect(decision.valueFinalCents).toBeGreaterThan(decision.workTotalCents);
  });

  it('sends a fair item to parts when even the upgraded value would not cover the work', () => {
    // At 30 % of its price, laptop-007 is worth ~€132 fair and ~€172 good, against €190 of work.
    const decision = decide('laptop-007', {}, Math.round(v1Price('laptop-007') * 0.3));
    expect(decision.valueAsIsCents).toBeGreaterThan(decision.requiredTotalCents);
    expect(decision.action).toBe('parts_bin');
    expect(decision.upgrade).toBeNull();
  });

  it('sends an item to parts when the mandatory work costs more than it is worth', () => {
    // ebike-007 at a tenth of its price: ~€116 after €395 of mandatory work. wait-02 accepts
    // fair, but nobody should be offered an item that loses money on the bench.
    const decision = decide('ebike-007', {}, Math.round(v1Price('ebike-007') / 10));
    expect(decision.valueAsIsCents).toBeLessThan(decision.requiredTotalCents);
    expect(decision.action).toBe('parts_bin');
  });
});
