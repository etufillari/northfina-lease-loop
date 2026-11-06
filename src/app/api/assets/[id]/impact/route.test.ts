import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetCircularImpactResult } from '@/server/second-life/circular-impact';

const { getAssetCircularImpactMock } = vi.hoisted(() => ({
  getAssetCircularImpactMock: vi.fn(),
}));

vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/second-life/circular-impact', async () => {
  const { z } = await import('zod');
  return {
    circularImpactQuerySchema: z.strictObject({ asOf: z.string() }),
    getAssetCircularImpact: getAssetCircularImpactMock,
  };
});

import { GET } from './route';

const asset = {
  id: 'ebike-008',
  category: 'e_bike',
  make: 'Kettu Bikes',
  model: 'Urban 1',
  model_year: 2022,
  serial_number: 'LL-EB-240959',
  condition: 'good',
  usage: { unit: 'km', value: 9800 },
  previous_lives: 2,
  status: 'returned',
} as const;

const impact = {
  assetId: 'ebike-008',
  asOf: '2026-11-06',
  totalLives: 3,
  reuseLives: 2,
  co2: {
    manufacturingNewGrams: 165000,
    refurbishmentGramsPerReuseLife: 19800,
    avoidedManufacturingGramsPerReuseLife: 145200,
    savedGrams: 290400,
    savedByLife: [
      { lifeNumber: 2, co2SavedGrams: 145200 },
      { lifeNumber: 3, co2SavedGrams: 145200 },
    ],
  },
  money: {
    originalListPriceCents: 549000,
    newListPriceCents: 576450,
    residualMarketValueCents: 100000,
    indicativeSavingsCents: 476450,
    ageMonths: 58,
    conditionMultiplier: 0.85,
    usageAdjustmentPercent: -18,
  },
  explanation: { co2: 'co2', money: 'money' },
};

function request(url: string): Request {
  return new Request(url);
}

beforeEach(() => getAssetCircularImpactMock.mockReset());

describe('GET /api/assets/:id/impact', () => {
  it('returns the asset impact in the standard envelope', async () => {
    getAssetCircularImpactMock.mockResolvedValue({
      ok: true,
      asset,
      impact,
    } satisfies AssetCircularImpactResult);

    const response = await GET(
      request('http://localhost/api/assets/ebike-008/impact?asOf=2026-11-06'),
      {
        params: Promise.resolve({ id: 'ebike-008' }),
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { asset, impact } });
    expect(getAssetCircularImpactMock).toHaveBeenCalledWith({}, 'ebike-008', {
      asOf: '2026-11-06',
    });
  });

  it('returns validation errors when asOf is missing', async () => {
    const response = await GET(request('http://localhost/api/assets/ebike-008/impact'), {
      params: Promise.resolve({ id: 'ebike-008' }),
    });

    expect(response.status).toBe(400);
    expect(getAssetCircularImpactMock).not.toHaveBeenCalled();
  });
});
