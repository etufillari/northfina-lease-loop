import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadAssets,
  loadCoefficientTable,
  loadPriceLists,
  loadResidualCurves,
  loadSecondLifeDemand,
} from '@/data/load';
import type {
  Asset,
  CoefficientTable,
  PriceList,
  ResidualCurves,
  SecondLifeRequest,
} from '@/data/schemas';
import { secondLifeMatchesFor } from './second-life-matching';

let asset: Asset;
let demand: SecondLifeRequest[];
let priceLists: PriceList[];
let curves: ResidualCurves;
let coefficientTable: CoefficientTable;

beforeAll(async () => {
  const [assets, requests, lists, residualCurves, table] = await Promise.all([
    loadAssets(),
    loadSecondLifeDemand(),
    loadPriceLists(),
    loadResidualCurves(),
    loadCoefficientTable(),
  ]);
  const selected = assets.find((candidate) => candidate.id === 'ebike-007');
  if (!selected) throw new Error('test asset not found');
  asset = {
    ...selected,
    condition: 'good',
    status: 'available',
    usage: { unit: 'km', value: 0 },
  };
  demand = requests;
  priceLists = lists;
  curves = residualCurves;
  coefficientTable = table;
});

describe('secondLifeMatchesFor', () => {
  it('calculates a residual-value rent and ranks eligible demand', () => {
    const result = secondLifeMatchesFor(
      asset,
      demand,
      priceLists,
      curves,
      coefficientTable,
      '2026-11-06'
    );

    expect(result).toMatchObject({
      ok: true,
      metadata: {
        source: 'demo_fallback',
        firstLeasedOn: '2023-01-01',
        originalListPriceCents: 549000,
      },
    });
    if (!result.ok) return;
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0]).toMatchObject({
      request: { id: 'wait-13' },
      pricing: { termMonths: 24 },
    });
    expect(result.matches[0]?.pricing.monthlyNetRentCents).toBeLessThanOrEqual(9000);
  });

  it('requires the asset category, condition and deadline to fit', () => {
    const result = secondLifeMatchesFor(
      asset,
      [
        { ...demand[0]!, id: 'wrong-category', category: 'laptop' },
        { ...demand[0]!, id: 'too-demanding', min_condition: 'like_new' },
        { ...demand[0]!, id: 'too-late', needed_by: '2026-11-05' },
      ],
      priceLists,
      curves,
      coefficientTable,
      '2026-11-06'
    );

    expect(result).toMatchObject({ ok: true, matches: [] });
    if (!result.ok) return;
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          request: expect.objectContaining({ id: 'wrong-category' }),
          reasons: expect.arrayContaining(['category_mismatch']),
        }),
        expect.objectContaining({
          request: expect.objectContaining({ id: 'too-demanding' }),
          reasons: expect.arrayContaining(['condition_below_minimum']),
        }),
        expect.objectContaining({
          request: expect.objectContaining({ id: 'too-late' }),
          reasons: expect.arrayContaining(['needed_by_expired']),
        }),
      ])
    );
  });

  it('uses deadline, then condition strictness, then request id as tie-breakers', () => {
    const requests: SecondLifeRequest[] = [
      {
        id: 'wait-z',
        category: 'e_bike',
        max_monthly_net_rent_cents: 20_000,
        min_condition: 'fair',
        preferred_term_months: 24,
        needed_by: '2026-12-01',
        who: 'Later, accepts fair',
      },
      {
        id: 'wait-b',
        category: 'e_bike',
        max_monthly_net_rent_cents: 20_000,
        min_condition: 'good',
        preferred_term_months: 24,
        needed_by: '2026-12-01',
        who: 'Later, requires good',
      },
      {
        id: 'wait-a',
        category: 'e_bike',
        max_monthly_net_rent_cents: 20_000,
        min_condition: 'good',
        preferred_term_months: 24,
        needed_by: '2026-11-10',
        who: 'Sooner',
      },
    ];

    const result = secondLifeMatchesFor(
      asset,
      requests,
      priceLists,
      curves,
      coefficientTable,
      '2026-11-06'
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.matches.map((match) => match.request.id)).toEqual(['wait-a', 'wait-b', 'wait-z']);
  });

  it('rejects an unavailable asset and missing original price', () => {
    expect(
      secondLifeMatchesFor(
        { ...asset, status: 'returned' },
        demand,
        priceLists,
        curves,
        coefficientTable,
        '2026-11-06'
      )
    ).toEqual({ ok: false, reason: 'asset_not_available', status: 'returned' });

    expect(
      secondLifeMatchesFor(
        { ...asset, id: 'missing-asset' },
        demand,
        priceLists,
        curves,
        coefficientTable,
        '2026-11-06'
      )
    ).toEqual({ ok: false, reason: 'original_price_not_found' });
  });

  it('rejects a lifecycle date that is after the match date', () => {
    expect(
      secondLifeMatchesFor(
        { ...asset, first_leased_on: '2027-01-01', original_list_price_cents: 549000 },
        demand,
        priceLists,
        curves,
        coefficientTable,
        '2026-11-06'
      )
    ).toEqual({ ok: false, reason: 'invalid_lifecycle_dates' });
  });
});
