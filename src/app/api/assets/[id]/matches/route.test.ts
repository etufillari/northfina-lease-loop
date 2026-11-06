import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SecondLifeAcceptanceResult } from '@/server/second-life-matching';

const { acceptSecondLifeMatchMock } = vi.hoisted(() => ({
  acceptSecondLifeMatchMock: vi.fn(),
}));

vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/second-life-matching', async () => {
  const { z } = await import('zod');
  return {
    acceptSecondLifeMatch: acceptSecondLifeMatchMock,
    secondLifeAcceptanceRequestSchema: z.strictObject({
      requestId: z.string().min(1),
      availableOn: z.iso.date(),
      actor: z.string().trim().min(1).max(100),
    }),
  };
});

import { POST } from './route';

const result = {
  asset: { id: 'ebike-007', status: 'reserved' },
  match: {
    id: 'match-1',
    assetId: 'ebike-007',
    requestId: 'wait-13',
    status: 'accepted' as const,
    matchedOn: '2026-11-06',
    actor: 'team-test',
    pricing: {} as never,
    request: {} as never,
  },
};

function request(body: unknown): Request {
  return new Request('http://localhost/api/assets/ebike-007/matches', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: 'ebike-007' }) };
const validBody = { requestId: 'wait-13', availableOn: '2026-11-06', actor: 'team-test' };

afterEach(() => {
  acceptSecondLifeMatchMock.mockReset();
});

describe('POST /api/assets/:id/matches', () => {
  it('returns the accepted match with a 201 response', async () => {
    acceptSecondLifeMatchMock.mockResolvedValue({
      ok: true,
      ...result,
    } as unknown as SecondLifeAcceptanceResult);

    const response = await POST(request(validBody), context);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, data: result });
    expect(acceptSecondLifeMatchMock).toHaveBeenCalledWith({}, 'ebike-007', validBody);
  });

  it('validates the request before calling the service', async () => {
    const response = await POST(request({ requestId: 'wait-13', actor: 'team-test' }), context);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(acceptSecondLifeMatchMock).not.toHaveBeenCalled();
  });

  it('maps an already matched request to a stable API error', async () => {
    acceptSecondLifeMatchMock.mockResolvedValue({
      ok: false,
      reason: 'request_already_matched',
      requestId: 'wait-13',
      matchId: 'match-1',
    } satisfies SecondLifeAcceptanceResult);

    const response = await POST(request(validBody), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'SECOND_LIFE_REQUEST_ALREADY_MATCHED' },
    });
  });
});
