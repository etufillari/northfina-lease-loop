import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EndOfTermResult } from '@/server/end-of-term';

const { completeContractMock } = vi.hoisted(() => ({ completeContractMock: vi.fn() }));

vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/end-of-term', async () => {
  const { z } = await import('zod');
  const base = {
    completedOn: z.iso.date(),
    actor: z.string().trim().min(1).max(100),
  };
  return {
    completeContract: completeContractMock,
    endOfTermRequestSchema: z.discriminatedUnion('action', [
      z.strictObject({
        ...base,
        action: z.literal('bought'),
        buyoutPaidCents: z.number().int().nonnegative(),
      }),
      z.strictObject({ ...base, action: z.literal('returned') }),
      z.strictObject({ ...base, action: z.literal('passed_on') }),
    ]),
  };
});

import { POST } from './route';

const completedContract = {
  id: 'contract-1',
  assetId: 'ebike-003',
  status: 'completed' as const,
  action: 'returned' as const,
  completedOn: '2029-11-05',
  buyoutCents: 58_350,
  buyoutPaidCents: null,
};

function request(body: unknown): Request {
  return new Request('http://localhost/api/contracts/contract-1/end-of-term', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: 'contract-1' }) };

afterEach(() => {
  completeContractMock.mockReset();
});

describe('POST /api/contracts/:id/end-of-term', () => {
  it('returns the completed contract in the standard success envelope', async () => {
    completeContractMock.mockResolvedValue({
      ok: true,
      contract: completedContract,
    } satisfies EndOfTermResult);

    const response = await POST(
      request({ action: 'returned', completedOn: '2029-11-05', actor: 'team-test' }),
      context
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { contract: completedContract },
    });
    expect(completeContractMock).toHaveBeenCalledWith({}, 'contract-1', {
      action: 'returned',
      completedOn: '2029-11-05',
      actor: 'team-test',
    });
  });

  it('validates buyout requests before calling the service', async () => {
    const response = await POST(
      request({ action: 'bought', completedOn: '2029-11-05', actor: 'team-test' }),
      context
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(completeContractMock).not.toHaveBeenCalled();
  });

  it('maps business failures to stable API errors', async () => {
    completeContractMock.mockResolvedValue({
      ok: false,
      reason: 'rent_balance_outstanding',
      outstandingRentCents: 13_466,
    } satisfies EndOfTermResult);

    const response = await POST(
      request({ action: 'returned', completedOn: '2029-11-05', actor: 'team-test' }),
      context
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      success: false,
      error: {
        code: 'RENT_BALANCE_OUTSTANDING',
        details: { outstandingRentCents: 13_466 },
      },
    });
  });
});
