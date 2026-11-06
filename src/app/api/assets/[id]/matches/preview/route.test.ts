import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SecondLifePreviewResult } from '@/server/second-life/second-life-matching';

const { previewSecondLifeMatchesMock } = vi.hoisted(() => ({
  previewSecondLifeMatchesMock: vi.fn(),
}));

vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/second-life/second-life-matching', async () => {
  const { z } = await import('zod');
  return {
    previewSecondLifeMatches: previewSecondLifeMatchesMock,
    secondLifePreviewRequestSchema: z.strictObject({ availableOn: z.iso.date() }),
  };
});

import { POST } from './route';

const preview = {
  asset: { id: 'ebike-007', status: 'available' },
  metadata: {
    firstLeasedOn: '2023-01-01',
    originalListPriceCents: 549000,
    source: 'demo_fallback' as const,
    originalPriceListVersion: 1,
  },
  candidates: [],
  matches: [],
};

function request(body: unknown): Request {
  return new Request('http://localhost/api/assets/ebike-007/matches/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: 'ebike-007' }) };

afterEach(() => {
  previewSecondLifeMatchesMock.mockReset();
});

describe('POST /api/assets/:id/matches/preview', () => {
  it('returns the ranked preview', async () => {
    previewSecondLifeMatchesMock.mockResolvedValue({
      ok: true,
      preview,
    } as unknown as SecondLifePreviewResult);

    const response = await POST(request({ availableOn: '2026-11-06' }), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: preview });
    expect(previewSecondLifeMatchesMock).toHaveBeenCalledWith({}, 'ebike-007', {
      availableOn: '2026-11-06',
    });
  });

  it('validates the match date before calling the service', async () => {
    const response = await POST(request({ availableOn: 'not-a-date' }), context);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(previewSecondLifeMatchesMock).not.toHaveBeenCalled();
  });

  it('maps an unavailable asset to a stable API error', async () => {
    previewSecondLifeMatchesMock.mockResolvedValue({
      ok: false,
      reason: 'asset_not_available',
      status: 'returned',
    } satisfies SecondLifePreviewResult);

    const response = await POST(request({ availableOn: '2026-11-06' }), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'ASSET_NOT_AVAILABLE', details: { status: 'returned' } },
    });
  });
});
