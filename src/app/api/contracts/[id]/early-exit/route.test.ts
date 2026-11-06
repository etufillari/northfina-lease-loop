import { afterEach, describe, expect, it, vi } from 'vitest';

const { requestEarlyExitMock } = vi.hoisted(() => ({ requestEarlyExitMock: vi.fn() }));

vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/lifecycle/early-exit', async () => {
  const { z } = await import('zod');
  return {
    requestEarlyExit: requestEarlyExitMock,
    earlyExitCreationRequestSchema: z.strictObject({
      action: z.enum(['bought', 'returned']),
      requestedOn: z.iso.date(),
      actor: z.string().trim().min(1).max(100),
    }),
  };
});

import { POST } from './route';

const pendingRequest = {
  id: 'exit-1',
  contractId: 'contract-1',
  status: 'pending',
  requestedOn: '2026-11-06',
  effectiveOn: '2026-12-05',
  action: 'returned',
  quote: {},
  vatRateBasisPoints: 2_550,
  vatCents: 45_900,
  settlementTotalCents: 225_900,
  settlementPaidCents: null,
  completedOn: null,
};

function request(body: unknown): Request {
  return new Request('http://localhost/api/contracts/contract-1/early-exit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: 'contract-1' }) };

afterEach(() => requestEarlyExitMock.mockReset());

describe('POST /api/contracts/:id/early-exit', () => {
  it('creates a pending request with accepted status', async () => {
    requestEarlyExitMock.mockResolvedValue({ ok: true, request: pendingRequest });

    const response = await POST(
      request({ action: 'returned', requestedOn: '2026-11-06', actor: 'team-test' }),
      context
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { request: pendingRequest },
    });
  });

  it('maps duplicate requests to a stable conflict', async () => {
    requestEarlyExitMock.mockResolvedValue({
      ok: false,
      reason: 'early_exit_request_exists',
      requestId: 'exit-1',
    });

    const response = await POST(
      request({ action: 'returned', requestedOn: '2026-11-06', actor: 'team-test' }),
      context
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'EARLY_EXIT_REQUEST_EXISTS', details: { requestId: 'exit-1' } },
    });
  });
});
