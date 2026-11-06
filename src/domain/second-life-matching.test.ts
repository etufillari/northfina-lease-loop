import { describe, expect, it } from 'vitest';
import type { Asset, CoefficientTable, SecondLifeRequest } from '../data/schemas';
import { matchSecondLifeDemand } from './second-life-matching';

const testAsset: Asset = {
  id: 'ebike-007',
  category: 'e_bike',
  make: 'Nordvolt',
  model: 'Trail 500',
  model_year: 2023,
  serial_number: 'TEST-EBIKE-007',
  condition: 'fair',
  usage: {
    unit: 'km',
    value: 0,
  },
  previous_lives: 1,
  status: 'returned',
};

const coefficientTable: CoefficientTable = {
  id: 'test-coefficients',
  version: 1,
  valid_from: '2026-01-01',
  currency: 'EUR',
  how_to_use: 'Monthly rent equals market value multiplied by the term factor.',
  end_of_term_buyout_percent_of_financed: {
    '12': 40,
    '24': 25,
    '36': 15,
    '48': 8,
  },
  bands: [
    {
      band: 'A',
      min_financed_cents: 30000,
      max_financed_cents: 199999,
      annual_interest_percent: 9.9,
      monthly_factor_by_term: {
        '12': 0.056022,
        '24': 0.036637,
        '36': 0.028625,
        '48': 0.023949,
      },
    },
  ],
};

function makeRequest(overrides: Partial<SecondLifeRequest> = {}): SecondLifeRequest {
  return {
    id: 'wait-02',
    category: 'e_bike',
    max_monthly_net_rent_cents: 9000,
    min_condition: 'fair',
    preferred_term_months: 12,
    needed_by: '2026-11-10',
    who: 'Delivery courier',
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<{
    asset: Asset;
    resultingCondition: Asset['condition'];
    marketValueCents: number;
    availableDate: string;
    requests: SecondLifeRequest[];
    coefficientTable: CoefficientTable;
  }> = {}
) {
  return {
    asset: testAsset,
    resultingCondition: 'good' as const,
    marketValueCents: 115976,
    availableDate: '2026-11-06',
    requests: [makeRequest()],
    coefficientTable,
    ...overrides,
  };
}

describe('matchSecondLifeDemand', () => {
  it('matches a returned asset to an eligible waiting-list request', () => {
    const result = matchSecondLifeDemand(makeInput());

    expect(result.ok).toBe(true);

    if (!result.ok) return;

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      assetId: 'ebike-007',
      requestId: 'wait-02',
      marketValueCents: 115976,
      monthlyNetRentCents: 6497,
      termMonths: 12,
    });
    expect(result.rejected).toHaveLength(0);
  });

  it('preserves the physical asset ID in the match', () => {
    const result = matchSecondLifeDemand(makeInput());

    expect(result.ok).toBe(true);

    if (!result.ok) return;

    expect(result.matches[0]?.assetId).toBe(testAsset.id);
  });

  it('rejects a request for a different asset category', () => {
    const result = matchSecondLifeDemand(
      makeInput({
        requests: [
          makeRequest({
            category: 'laptop',
          }),
        ],
      })
    );

    expect(result.ok).toBe(true);

    if (!result.ok) return;

    expect(result.matches).toHaveLength(0);
    expect(result.rejected).toEqual([
      {
        requestId: 'wait-02',
        reason: 'category_mismatch',
      },
    ]);
  });

  it('rejects a request when the refurbished condition is too low', () => {
    const result = matchSecondLifeDemand(
      makeInput({
        resultingCondition: 'fair',
        requests: [
          makeRequest({
            min_condition: 'good',
          }),
        ],
      })
    );

    expect(result.ok).toBe(true);

    if (!result.ok) return;

    expect(result.matches).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe('condition_below_minimum');
  });

  it('rejects a request when the asset will not be ready by the deadline', () => {
    const result = matchSecondLifeDemand(
      makeInput({
        availableDate: '2026-11-11',
      })
    );

    expect(result.ok).toBe(true);

    if (!result.ok) return;

    expect(result.matches).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe('not_available_by_deadline');
  });

  it('rejects a request when monthly rent exceeds the budget', () => {
    const result = matchSecondLifeDemand(
      makeInput({
        requests: [
          makeRequest({
            max_monthly_net_rent_cents: 1000,
          }),
        ],
      })
    );

    expect(result.ok).toBe(true);

    if (!result.ok) return;

    expect(result.matches).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe('over_budget');
  });

  it('rejects an asset that is not in returned status', () => {
    const result = matchSecondLifeDemand(
      makeInput({
        asset: {
          ...testAsset,
          status: 'available',
        },
      })
    );

    expect(result).toEqual({
      ok: false,
      reason: 'asset_not_returned',
    });
  });

  it('rejects an invalid availability date', () => {
    const result = matchSecondLifeDemand(
      makeInput({
        availableDate: '2026-02-31',
      })
    );

    expect(result).toEqual({
      ok: false,
      reason: 'invalid_date',
    });
  });

  it('rejects a market value outside all coefficient bands', () => {
    const result = matchSecondLifeDemand(
      makeInput({
        marketValueCents: 25000,
      })
    );

    expect(result).toEqual({
      ok: false,
      reason: 'missing_coefficient_band',
    });
  });

  it('rejects a request with an unsupported lease term', () => {
    const result = matchSecondLifeDemand(
      makeInput({
        requests: [
          makeRequest({
            preferred_term_months: 18,
          }),
        ],
      })
    );

    expect(result.ok).toBe(true);

    if (!result.ok) return;

    expect(result.matches).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe('unsupported_term');
  });

  it('ranks the stricter condition requirement first when deadlines are equal', () => {
    const result = matchSecondLifeDemand(
      makeInput({
        requests: [
          makeRequest({
            id: 'wait-02',
            min_condition: 'fair',
          }),
          makeRequest({
            id: 'wait-13',
            min_condition: 'good',
            preferred_term_months: 24,
          }),
        ],
      })
    );

    expect(result.ok).toBe(true);

    if (!result.ok) return;

    expect(result.matches.map((match) => match.requestId)).toEqual(['wait-13', 'wait-02']);
  });

  it('uses request ID alphabetically as the final tie-break', () => {
    const result = matchSecondLifeDemand(
      makeInput({
        requests: [
          makeRequest({
            id: 'wait-13',
          }),
          makeRequest({
            id: 'wait-02',
          }),
        ],
      })
    );

    expect(result.ok).toBe(true);

    if (!result.ok) return;

    expect(result.matches.map((match) => match.requestId)).toEqual(['wait-02', 'wait-13']);
  });
});
