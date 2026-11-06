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
import {
  handoverConditionCeiling,
  mandatoryStepsFor,
  namedRecipientTermMonths,
  offerForRecipient,
  passOnOptionsFor,
  type PassOnInput,
  type PassOnOptions,
} from './pass-on';

let assets: Asset[];
let demand: SecondLifeRequest[];
let priceLists: PriceList[];
let curves: ResidualCurves;
let coefficientTable: CoefficientTable;
let refurbishmentCosts: RefurbishmentCosts;

beforeAll(async () => {
  [assets, demand, priceLists, curves, coefficientTable, refurbishmentCosts] = await Promise.all([
    loadAssets(),
    loadSecondLifeDemand(),
    loadPriceLists(),
    loadResidualCurves(),
    loadCoefficientTable(),
    loadRefurbishmentCosts(),
  ]);
});

function leasedAsset(id = 'ebike-003'): Asset {
  const asset = assets.find((candidate) => candidate.id === id);
  if (!asset) throw new Error(`Missing fixture ${id}`);
  return {
    ...asset,
    status: 'reserved',
    first_leased_on: '2026-01-15',
    usage: { ...asset.usage, value: 1_000 },
  };
}

function input(overrides: Partial<PassOnInput> = {}): PassOnInput {
  const asset = leasedAsset();
  return {
    asset,
    handover: { condition: 'like_new', usageValue: asset.usage.value + 2_000 },
    handoverOn: '2026-11-08',
    demand,
    priceLists,
    curves,
    coefficientTable,
    refurbishmentCosts,
    ...overrides,
  };
}

function options(overrides: Partial<PassOnInput> = {}): PassOnOptions {
  const result = passOnOptionsFor(input(overrides));
  if (!result.ok) throw new Error(`Expected options, got ${result.reason}`);
  return result;
}

describe('passOnOptionsFor', () => {
  it('prices the item as handed over, not as last recorded', () => {
    const asset = leasedAsset();
    const lightlyUsed = options({
      handover: { condition: 'like_new', usageValue: asset.usage.value },
    });
    const worn = options({ handover: { condition: 'fair', usageValue: asset.usage.value } });

    expect(lightlyUsed.handedOverAsset).toMatchObject({ status: 'available' });
    expect(worn.handedOverAsset.condition).toBe('fair');
    expect(worn.waitingList.every(({ request }) => request.min_condition !== 'good')).toBe(true);
  });

  it('offers a named person the used-value rent over the fixed term', () => {
    const result = options();

    expect(result.named?.pricing.termMonths).toBe(namedRecipientTermMonths);
    expect(result.named?.pricing.marketValueCents).toBeGreaterThan(0);
    expect(result.waitingList.every(({ request }) => request.id !== 'named')).toBe(true);
  });

  it('only offers waiting-list entries in the same category with a valid deadline', () => {
    const result = options({ handoverOn: '2026-11-15' });

    for (const { request } of result.waitingList) {
      expect(request.category).toBe('e_bike');
      expect(request.needed_by >= '2026-11-15').toBe(true);
    }
  });

  it('keeps a named person out below good, while a waiting-list entry can accept fair', () => {
    const acceptsFair: SecondLifeRequest = {
      id: 'wait-fair',
      category: 'e_bike',
      max_monthly_net_rent_cents: 1_000_000,
      min_condition: 'fair',
      preferred_term_months: 24,
      needed_by: '2026-12-31',
      who: 'Accepts scratches',
    };
    const result = options({
      demand: [acceptsFair],
      handover: { condition: 'fair', usageValue: leasedAsset().usage.value },
    });

    expect(result.named).toBeNull();
    expect(result.waitingList.map(({ request }) => request.id)).toEqual(['wait-fair']);
  });

  it('refuses a report better than our records', () => {
    const asset: Asset = { ...leasedAsset(), condition: 'fair' };

    expect(
      passOnOptionsFor(input({ asset, handover: { condition: 'good', usageValue: 99_999 } }))
    ).toEqual({ ok: false, reason: 'condition_above_recorded', recorded: 'fair' });
    expect(
      passOnOptionsFor(
        input({ asset, handover: { condition: 'fair', usageValue: asset.usage.value - 1 } })
      )
    ).toEqual({ ok: false, reason: 'usage_below_recorded', recorded: asset.usage.value });
  });

  it('does not let a leased item count as new any more', () => {
    const asset = leasedAsset();
    expect(asset.condition).toBe('new');

    expect(
      passOnOptionsFor(input({ handover: { condition: 'new', usageValue: asset.usage.value } }))
    ).toEqual({ ok: false, reason: 'condition_above_recorded', recorded: 'like_new' });
    expect(handoverConditionCeiling('good')).toBe('good');
  });

  it('rejects a usage value that is not a whole number', () => {
    expect(() =>
      passOnOptionsFor(input({ handover: { condition: 'good', usageValue: 1.5 } }))
    ).toThrow(RangeError);
  });

  it('passes pricing failures through', () => {
    expect(passOnOptionsFor(input({ handoverOn: '2025-01-01' }))).toEqual({
      ok: false,
      reason: 'invalid_lifecycle_dates',
    });
  });
});

describe('mandatoryStepsFor', () => {
  it('requires the certified wipe for laptops only', () => {
    expect(mandatoryStepsFor('laptop', refurbishmentCosts)).toEqual(['certified_data_wipe']);
    expect(mandatoryStepsFor('e_bike', refurbishmentCosts)).toEqual([]);
  });
});

describe('offerForRecipient', () => {
  it('finds the offer for the chosen person and refuses anyone else', () => {
    const result = options();
    const first = result.waitingList[0];
    if (!first) throw new Error('Expected a waiting-list match');

    expect(offerForRecipient(result, { type: 'waiting_list', requestId: first.request.id })).toBe(
      first.pricing
    );
    expect(offerForRecipient(result, { type: 'named', name: 'A', email: 'a@example.com' })).toBe(
      result.named?.pricing
    );
    expect(offerForRecipient(result, { type: 'waiting_list', requestId: 'nobody' })).toBeNull();
    expect(
      offerForRecipient(
        { ...result, named: null },
        {
          type: 'named',
          name: 'A',
          email: 'a@example.com',
        }
      )
    ).toBeNull();
  });
});
