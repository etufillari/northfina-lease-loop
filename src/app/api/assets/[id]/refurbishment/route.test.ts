import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RefurbishmentResult } from '@/server/refurbishment';

const { completeRefurbishmentMock } = vi.hoisted(() => ({ completeRefurbishmentMock: vi.fn() }));

vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/refurbishment', async () => {
  const { z } = await import('zod');
  return {
    completeRefurbishment: completeRefurbishmentMock,
    refurbishmentCompletionRequestSchema: z.strictObject({
      targetCondition: z.enum(['new', 'like_new', 'good', 'fair', 'poor']).optional(),
      completedOn: z.iso.date(),
      actor: z.string().trim().min(1).max(100),
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
  return new Request('http://localhost/api/assets/ebike-007/refurbishment', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: 'ebike-007' }) };

afterEach(() => {
  completeRefurbishmentMock.mockReset();
});

describe('POST /api/assets/:id/refurbishment', () => {
  it('returns the refurbished asset and accepted quote', async () => {
    completeRefurbishmentMock.mockResolvedValue({
      ok: true,
      asset: {
        id: 'ebike-007',
        category: 'e_bike',
        make: 'Nordvolt',
        model: 'Cargo Duo',
        model_year: 2023,
        serial_number: 'LL-EB-240822',
        condition: 'good',
        usage: { unit: 'km', value: 0 },
        previous_lives: 1,
        status: 'available',
      },
      quote,
    } satisfies RefurbishmentResult);

    const response = await POST(
      request({ completedOn: '2026-11-06', actor: 'team-test' }),
      context
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { asset: { id: 'ebike-007', status: 'available' }, quote },
    });
    expect(completeRefurbishmentMock).toHaveBeenCalledWith({}, 'ebike-007', {
      completedOn: '2026-11-06',
      actor: 'team-test',
    });
  });

  it('validates the completion request before calling the service', async () => {
    const response = await POST(request({ actor: 'team-test' }), context);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(completeRefurbishmentMock).not.toHaveBeenCalled();
  });
});
