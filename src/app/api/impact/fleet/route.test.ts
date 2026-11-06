import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FleetCircularImpactResult } from '@/server/second-life/circular-impact';

const { getFleetCircularImpactMock } = vi.hoisted(() => ({
  getFleetCircularImpactMock: vi.fn(),
}));

vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/second-life/circular-impact', async () => {
  const { z } = await import('zod');
  return {
    circularImpactQuerySchema: z.strictObject({ asOf: z.string() }),
    getFleetCircularImpact: getFleetCircularImpactMock,
  };
});

import { GET } from './route';

const impact = {
  asOf: '2026-11-06',
  items: [],
  excluded: [],
  totals: {
    assetCount: 0,
    reuseLives: 0,
    co2SavedGrams: 0,
    indicativeSavingsCents: 0,
  },
};

beforeEach(() => getFleetCircularImpactMock.mockReset());

describe('GET /api/impact/fleet', () => {
  it('returns fleet impact in the standard envelope', async () => {
    getFleetCircularImpactMock.mockResolvedValue({
      ok: true,
      impact,
    } satisfies FleetCircularImpactResult);

    const response = await GET(
      new Request('http://localhost/api/impact/fleet?asOf=2026-11-06'),
      undefined
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: impact });
    expect(getFleetCircularImpactMock).toHaveBeenCalledWith({}, { asOf: '2026-11-06' });
  });

  it('returns validation errors when asOf is missing', async () => {
    const response = await GET(new Request('http://localhost/api/impact/fleet'), undefined);

    expect(response.status).toBe(400);
    expect(getFleetCircularImpactMock).not.toHaveBeenCalled();
  });
});
