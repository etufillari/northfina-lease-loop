import { afterEach, describe, expect, it, vi } from 'vitest';

const { processEarlyExitMock } = vi.hoisted(() => ({ processEarlyExitMock: vi.fn() }));

vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/early-exit', async () => {
  const { z } = await import('zod');
  return {
    processEarlyExit: processEarlyExitMock,
    earlyExitProcessRequestSchema: z.strictObject({
      processedOn: z.iso.date(),
      settlementPaidCents: z.number().int().nonnegative(),
      actor: z.string().trim().min(1).max(100),
    }),
  };
});

import { POST } from './route';

const termination = {
  id: 'exit-1',
  contractId: 'contract-1',
  status: 'completed',
  requestedOn: '2026-11-06',
  effectiveOn: '2026-12-05',
  action: 'returned',
  quote: {},
  vatRateBasisPoints: 2_550,
  vatCents: 45_900,
  settlementTotalCents: 225_900,
  settlementPaidCents: 225_900,
  completedOn: '2026-12-05',
};

function request(body: unknown): Request {
  return new Request('http://localhost/api/contracts/contract-1/early-exit/process', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: 'contract-1' }) };

afterEach(() => processEarlyExitMock.mockReset());

describe('POST /api/contracts/:id/early-exit/process', () => {
  it('returns the completed termination', async () => {
    processEarlyExitMock.mockResolvedValue({ ok: true, termination });

    const response = await POST(
      request({
        processedOn: '2026-12-05',
        settlementPaidCents: 225_900,
        actor: 'team-test',
      }),
      context
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { termination } });
  });

  it('maps an unpaid balance to a stable error', async () => {
    processEarlyExitMock.mockResolvedValue({
      ok: false,
      reason: 'rent_balance_outstanding',
      outstandingRentCents: 13_466,
    });

    const response = await POST(
      request({ processedOn: '2026-12-05', settlementPaidCents: 225_900, actor: 'team-test' }),
      context
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'RENT_BALANCE_OUTSTANDING', details: { outstandingRentCents: 13_466 } },
    });
  });
});
