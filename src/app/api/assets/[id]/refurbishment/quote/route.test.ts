import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RefurbishmentResult } from '@/server/refurbishment';

const { quoteRefurbishmentMock } = vi.hoisted(() => ({ quoteRefurbishmentMock: vi.fn() }));

vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/refurbishment', async () => {
  const { z } = await import('zod');
  return {
    quoteRefurbishment: quoteRefurbishmentMock,
    refurbishmentQuoteRequestSchema: z.strictObject({
      targetCondition: z.enum(['new', 'like_new', 'good', 'fair', 'poor']).optional(),
    }),
  };
});

import { POST } from './route';

const quote = {
  currentCondition: 'fair' as const,
  targetCondition: 'good' as const,
  conditionUpgradeCents: 12_000,
  fixedWork: [],
  totalCostCents: 12_000,
  usageAfterValue: 18_400,
  usageReset: false,
};

function request(body: unknown): Request {
  return new Request('http://localhost/api/assets/ebike-007/refurbishment/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: 'ebike-007' }) };

afterEach(() => {
  quoteRefurbishmentMock.mockReset();
});

describe('POST /api/assets/:id/refurbishment/quote', () => {
  it('returns a quote in the standard success envelope', async () => {
    quoteRefurbishmentMock.mockResolvedValue({
      ok: true,
      asset: {
        id: 'ebike-007',
        category: 'e_bike',
        make: 'Nordvolt',
        model: 'Cargo Duo',
        model_year: 2023,
        serial_number: 'LL-EB-240822',
        condition: 'fair',
        usage: { unit: 'km', value: 18_400 },
        previous_lives: 1,
        status: 'returned',
      },
      quote,
    } satisfies RefurbishmentResult);

    const response = await POST(request({}), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { asset: { id: 'ebike-007' }, quote },
    });
    expect(quoteRefurbishmentMock).toHaveBeenCalledWith({}, 'ebike-007', {});
  });

  it('validates target conditions before calling the service', async () => {
    const response = await POST(request({ targetCondition: 'broken' }), context);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(quoteRefurbishmentMock).not.toHaveBeenCalled();
  });

  it('maps an unavailable asset to a stable API error', async () => {
    quoteRefurbishmentMock.mockResolvedValue({
      ok: false,
      reason: 'asset_not_returned',
      status: 'available',
    } satisfies RefurbishmentResult);

    const response = await POST(request({}), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'ASSET_NOT_RETURNED', details: { status: 'available' } },
    });
  });
});
