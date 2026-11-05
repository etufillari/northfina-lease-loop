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
});
