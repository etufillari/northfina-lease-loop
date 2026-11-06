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
  allocateDesk,
  allocateRefurbished,
  type DeskItem,
  type RefurbishedItem,
} from './second-life-allocation';

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

/** A refurbished laptop listed in the catalogue: 30 077 cents is €8.61 / month at 36 months. */
const shelfLaptop = (assetId: string, financedCents = 30_077): RefurbishedItem => ({
  assetId,
  category: 'laptop',
  condition: 'good',
  financedCents,
});

describe('allocateDesk: one person, one offer', () => {
  it('card 9: ebike-007 goes to wait-02, so ebike-008 goes to the next in line', () => {
    const result = allocateDesk(
      [item('ebike-008'), item('ebike-007')],
      { asOfDate: AS_OF, demand, shelf: [] },
      data
    );
    expect(result.map((r) => r.assetId)).toEqual(['ebike-007', 'ebike-008']);
    expect(outcomes(result)).toEqual({
      'ebike-007': { kind: 'offer', waiterId: 'wait-02', withAssetIds: [] },
      'ebike-008': { kind: 'offer', waiterId: 'wait-01', withAssetIds: [] },
    });
    expect(result[1]!.decision.considered.map((v) => v.id)).not.toContain('wait-02');
  });

  it('gives the same answer whatever order the items come in', () => {
    const ids = ['laptop-007', 'ebike-011', 'ebike-007', 'laptop-006', 'ebike-008'];
    const forward = allocateDesk(ids.map(item), { asOfDate: AS_OF, demand, shelf: [] }, data);
    const backward = allocateDesk(
      [...ids].reverse().map(item),
      { asOfDate: AS_OF, demand, shelf: [] },
      data
    );
    expect(outcomes(backward)).toEqual(outcomes(forward));
  });

  it('returns nothing for an empty desk', () => {
    expect(allocateDesk([], { asOfDate: AS_OF, demand, shelf: [] }, data)).toEqual([]);
  });
});

describe('allocateDesk: a multi-item waiter gets a whole set or nothing', () => {
  it('skips wait-08 (needs 3) when the set cannot be completed: the laptop goes on', () => {
    const [result] = allocateDesk(
      [item('laptop-006')],
      { asOfDate: AS_OF, demand, shelf: [] },
      data
    );
    expect(result!.outcome).toMatchObject({ kind: 'offer', withAssetIds: [] });
    expect(result!.outcome).not.toMatchObject({ waiterId: 'wait-08' });
    const verdict = result!.decision.considered.find((v) => v.id === 'wait-08');
    expect(verdict).toMatchObject({ outcome: 'set_incomplete' });
    expect(verdict?.monthlyNetRentCents).toBeGreaterThan(0);
  });

  it('offers the whole set when two matching laptops are already listed', () => {
    const [result] = allocateDesk(
      [item('laptop-006')],
      { asOfDate: AS_OF, demand, shelf: [shelfLaptop('laptop-s2'), shelfLaptop('laptop-s1')] },
      data
    );
    expect(result!.outcome).toEqual({
      kind: 'offer',
      waiterId: 'wait-08',
      withAssetIds: ['laptop-s1', 'laptop-s2'],
    });
  });

  it('only counts listed items that fit them: one over their budget leaves the set short', () => {
    const [result] = allocateDesk(
      [item('laptop-006')],
      {
        asOfDate: AS_OF,
        demand,
        // 70 000 cents is €20.04 / month at 36 months: over wait-08's €18.
        shelf: [shelfLaptop('laptop-s1'), shelfLaptop('laptop-s2', 70_000)],
      },
      data
    );
    expect(result!.outcome).not.toMatchObject({ waiterId: 'wait-08' });
  });

  it('uses a listed item once: the next laptop goes to the next person', () => {
    const result = allocateDesk(
      [item('laptop-006'), item('laptop-007')],
      { asOfDate: AS_OF, demand, shelf: [shelfLaptop('laptop-s1'), shelfLaptop('laptop-s2')] },
      data
    );
    expect(outcomes(result)).toEqual({
      'laptop-006': {
        kind: 'offer',
        waiterId: 'wait-08',
        withAssetIds: ['laptop-s1', 'laptop-s2'],
      },
      // wait-08 is served; laptop-007 (fair) is upgraded to good, which fits wait-06's budget
      // and wait-06 joined before the identical wait-14.
      'laptop-007': { kind: 'offer', waiterId: 'wait-06', withAssetIds: [] },
    });
    expect(result[1]!.decision.upgrade).toMatchObject({ from: 'fair', to: 'good' });
  });

  it('a single-item waiter ahead in the queue still comes first', () => {
    const early: SecondLifeRequest = {
      ...demand.find((w) => w.id === 'wait-08')!,
      id: 'early-bird',
      quantity: 1,
      joined_on: '2026-09-01',
      who: 'Joined before the non-profit',
    };
    const [result] = allocateDesk(
      [item('laptop-006')],
      {
        asOfDate: AS_OF,
        demand: [...demand, early],
        shelf: [shelfLaptop('laptop-s1'), shelfLaptop('laptop-s2')],
      },
      data
    );
    expect(result!.outcome).toEqual({ kind: 'offer', waiterId: 'early-bird', withAssetIds: [] });
  });

  it('is not served past their deadline, whatever is listed', () => {
    // wait-08 needs the laptops by 2026-11-12.
    const [result] = allocateDesk(
      [item('laptop-006')],
      {
        asOfDate: '2026-11-13',
        demand,
        shelf: [shelfLaptop('laptop-s1'), shelfLaptop('laptop-s2')],
      },
      data
    );
    expect(result!.outcome).not.toMatchObject({ waiterId: 'wait-08' });
    expect(result!.decision.considered.find((v) => v.id === 'wait-08')?.outcome).toBe(
      'deadline_passed'
    );
  });
});

describe('allocateDesk: nobody wins', () => {
  it('lists an item nobody on the list can take', () => {
    const result = allocateDesk(
      [item('ebike-008')],
      { asOfDate: AS_OF, demand: [], shelf: [] },
      data
    );
    expect(result[0]!.outcome).toEqual({ kind: 'list_available' });
  });

  it('sends an item worth too little to the parts bin', () => {
    const result = allocateDesk(
      [item('laptop-006')],
      { asOfDate: '2027-05-01', demand, shelf: [] },
      data
    );
    expect(result[0]!.outcome).toEqual({ kind: 'parts_bin' });
  });
});

describe('allocateRefurbished: passing a refurbished item on', () => {
  const ebike: RefurbishedItem = {
    assetId: 'ebike-007',
    category: 'e_bike',
    condition: 'fair',
    financedCents: 155_476,
  };
  const without = (...ids: string[]) => demand.filter((w) => !ids.includes(w.id));
  const onlyWait08 = () => demand.filter((w) => w.id === 'wait-08');

  it('lists it when nobody who is left fits', () => {
    // wait-02 declined, so they are off the list; nobody else accepts 'fair'.
    const [result] = allocateRefurbished(
      [ebike],
      { asOfDate: AS_OF, demand: without('wait-02'), shelf: [] },
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
      { asOfDate: AS_OF, demand: without('wait-02'), shelf: [] },
      data.table
    );
    expect(result.map((r) => [r.assetId, r.outcome])).toEqual([
      ['ebike-a', { kind: 'offer', waiterId: 'wait-01', withAssetIds: [] }],
      ['ebike-b', { kind: 'offer', waiterId: 'wait-13', withAssetIds: [] }],
    ]);
  });

  it('a declined set of three goes whole to the next person who wants three', () => {
    const batch = ['laptop-c', 'laptop-a', 'laptop-b'].map((id) => shelfLaptop(id));
    const result = allocateRefurbished(
      batch,
      { asOfDate: AS_OF, demand: onlyWait08(), shelf: [] },
      data.table
    );
    expect(result.map((r) => [r.assetId, r.outcome])).toEqual([
      ['laptop-a', { kind: 'offer', waiterId: 'wait-08', withAssetIds: ['laptop-b', 'laptop-c'] }],
      ['laptop-b', { kind: 'in_set', waiterId: 'wait-08' }],
      ['laptop-c', { kind: 'in_set', waiterId: 'wait-08' }],
    ]);
  });

  it('combines the batch with listed items to complete a set', () => {
    const [result] = allocateRefurbished(
      [shelfLaptop('laptop-b')],
      {
        asOfDate: AS_OF,
        demand: onlyWait08(),
        shelf: [shelfLaptop('laptop-a'), shelfLaptop('laptop-c')],
      },
      data.table
    );
    expect(result!.outcome).toEqual({
      kind: 'offer',
      waiterId: 'wait-08',
      withAssetIds: ['laptop-a', 'laptop-c'],
    });
  });

  it('lists a single laptop when the only person who wants it needs three', () => {
    const [result] = allocateRefurbished(
      [shelfLaptop('laptop-a')],
      { asOfDate: AS_OF, demand: onlyWait08(), shelf: [] },
      data.table
    );
    expect(result!.outcome).toEqual({ kind: 'list_available' });
    expect(result!.considered).toEqual([
      expect.objectContaining({ id: 'wait-08', outcome: 'set_incomplete' }),
    ]);
  });
});
