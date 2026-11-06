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
import { allocateDesk, allocateRefurbished, type DeskItem } from './second-life-allocation';

let assets: Asset[];
let priceLists: PriceList[];
let data: { curves: ResidualCurves; costs: RefurbishmentCosts; table: CoefficientTable };
let demand: SecondLifeRequest[];
beforeAll(async () => {
  let curves: ResidualCurves, costs: RefurbishmentCosts, table: CoefficientTable;
  [assets, priceLists, curves, costs, table, demand] = await Promise.all([
    loadAssets(),
    loadPriceLists(),
    loadResidualCurves(),
    loadRefurbishmentCosts(),
    loadCoefficientTable(),
    loadSecondLifeDemand(),
  ]);
  data = { curves, costs, table };
});

const AS_OF = '2026-11-05';

function item(id: string): DeskItem {
  const asset = assets.find((a) => a.id === id)!;
  const price = listPriceOn(priceLists, id, '2026-01-01');
  if (!price.ok) throw new Error(`no v1 price for ${id}`);
  return { asset, originalListPriceCents: price.priceCents };
}

const outcomes = (result: ReturnType<typeof allocateDesk>) =>
  Object.fromEntries(result.map((r) => [r.assetId, r.outcome]));

describe('allocateDesk: one person, one offer', () => {
  it('card 9: ebike-007 goes to wait-02, so ebike-008 goes to the next in line', () => {
    const result = allocateDesk(
      [item('ebike-008'), item('ebike-007')],
      { asOfDate: AS_OF, demand, pooled: {} },
      data
    );
    expect(result.map((r) => r.assetId)).toEqual(['ebike-007', 'ebike-008']);
    expect(outcomes(result)).toEqual({
      'ebike-007': { kind: 'offer', waiterId: 'wait-02' },
      'ebike-008': { kind: 'offer', waiterId: 'wait-01' },
    });
    expect(result[1]!.decision.considered.map((v) => v.id)).not.toContain('wait-02');
  });

  it('gives the same answer whatever order the items come in', () => {
    const ids = ['laptop-007', 'ebike-011', 'ebike-007', 'laptop-006', 'ebike-008'];
    const forward = allocateDesk(ids.map(item), { asOfDate: AS_OF, demand, pooled: {} }, data);
    const backward = allocateDesk(
      [...ids].reverse().map(item),
      { asOfDate: AS_OF, demand, pooled: {} },
      data
    );
    expect(outcomes(backward)).toEqual(outcomes(forward));
  });

  it('returns nothing for an empty desk', () => {
    expect(allocateDesk([], { asOfDate: AS_OF, demand, pooled: {} }, data)).toEqual([]);
  });
});

describe('allocateDesk: pooling for a multi-item waiter', () => {
  it('holds both returned laptops for wait-08 (needs 3) instead of offering either', () => {
    const result = allocateDesk(
      [item('laptop-006'), item('laptop-007')],
      { asOfDate: AS_OF, demand, pooled: {} },
      data
    );
    expect(outcomes(result)).toEqual({
      'laptop-006': { kind: 'pool', waiterId: 'wait-08', filled: 1, quantity: 3 },
      'laptop-007': { kind: 'pool', waiterId: 'wait-08', filled: 2, quantity: 3 },
    });
  });

  it('offers the whole set once the pool is full, then serves the next person', () => {
    const result = allocateDesk(
      [item('laptop-006'), item('laptop-007')],
      { asOfDate: AS_OF, demand, pooled: { 'wait-08': 2 } },
      data
    );
    expect(outcomes(result)).toEqual({
      'laptop-006': { kind: 'complete_pool', waiterId: 'wait-08', quantity: 3 },
      // wait-08 is served; laptop-007 (fair) is upgraded to good, which fits wait-06's budget
      // and wait-06 joined before the identical wait-14 and wait-09.
      'laptop-007': { kind: 'offer', waiterId: 'wait-06' },
    });
    expect(result[1]!.decision.upgrade).toMatchObject({ from: 'fair', to: 'good' });
  });

  it('does not pool when a single-item waiter is ahead in the queue', () => {
    const early: SecondLifeRequest = {
      ...demand.find((w) => w.id === 'wait-08')!,
      id: 'early-bird',
      quantity: 1,
      joined_on: '2026-09-01',
      who: 'Joined before the non-profit',
    };
    const result = allocateDesk(
      [item('laptop-006'), item('laptop-007')],
      { asOfDate: AS_OF, demand: [...demand, early], pooled: {} },
      data
    );
    expect(outcomes(result)).toEqual({
      'laptop-006': { kind: 'offer', waiterId: 'early-bird' },
      'laptop-007': { kind: 'pool', waiterId: 'wait-08', filled: 1, quantity: 3 },
    });
  });

  it('stops pooling once the waiter is past their deadline', () => {
    // wait-08 needs the laptops by 2026-11-12.
    const result = allocateDesk(
      [item('laptop-006')],
      { asOfDate: '2026-11-13', demand, pooled: { 'wait-08': 2 } },
      data
    );
    expect(result[0]!.outcome.kind).not.toBe('complete_pool');
    expect(result[0]!.decision.considered.find((v) => v.id === 'wait-08')?.outcome).toBe(
      'deadline_passed'
    );
  });
});

describe('allocateDesk: nobody wins', () => {
  it('lists an item nobody on the list can take', () => {
    const result = allocateDesk(
      [item('ebike-008')],
      { asOfDate: AS_OF, demand: [], pooled: {} },
      data
    );
    expect(result[0]!.outcome).toEqual({ kind: 'list_available' });
  });

  it('sends an item worth too little to the parts bin', () => {
    const result = allocateDesk(
      [item('laptop-006')],
      { asOfDate: '2027-05-01', demand, pooled: {} },
      data
    );
    expect(result[0]!.outcome).toEqual({ kind: 'parts_bin' });
  });
});

describe('allocateRefurbished: passing a refurbished item on', () => {
  const ebike = {
    assetId: 'ebike-007',
    category: 'e_bike' as const,
    condition: 'fair' as const,
    financedCents: 155_476,
  };
  const without = (...ids: string[]) => demand.filter((w) => !ids.includes(w.id));

  it('offers it to the next person who fits, at the price the desk already set', () => {
    // wait-02 declined, so they are off the list; nobody else accepts 'fair'.
    const [result] = allocateRefurbished(
      [ebike],
      {
        asOfDate: AS_OF,
        demand: without('wait-02'),
        pooled: {},
      },
      data.table
    );
    expect(result!.outcome).toEqual({ kind: 'list_available' });
    expect(result!.considered.find((v) => v.id === 'wait-13')?.outcome).toBe(
      'condition_below_minimum'
    );
  });

  it('serves each person once, first come first served', () => {
    const good = { ...ebike, condition: 'good' as const, financedCents: 37_101 };
    const result = allocateRefurbished(
      [
        { ...good, assetId: 'ebike-b' },
        { ...good, assetId: 'ebike-a' },
      ],
      { asOfDate: AS_OF, demand: without('wait-02'), pooled: {} },
      data.table
    );
    expect(result.map((r) => [r.assetId, r.outcome])).toEqual([
      ['ebike-a', { kind: 'offer', waiterId: 'wait-01' }],
      ['ebike-b', { kind: 'offer', waiterId: 'wait-13' }],
    ]);
  });

  it('pools a laptop for wait-08 and completes the set when it is the last one', () => {
    const laptop = {
      assetId: 'laptop-006',
      category: 'laptop' as const,
      condition: 'good' as const,
      financedCents: 30_077,
    };
    const pool = (pooled: Record<string, number>) =>
      allocateRefurbished([laptop], { asOfDate: AS_OF, demand, pooled }, data.table)[0]!.outcome;
    expect(pool({})).toEqual({ kind: 'pool', waiterId: 'wait-08', filled: 1, quantity: 3 });
    expect(pool({ 'wait-08': 2 })).toEqual({
      kind: 'complete_pool',
      waiterId: 'wait-08',
      quantity: 3,
    });
  });
});
