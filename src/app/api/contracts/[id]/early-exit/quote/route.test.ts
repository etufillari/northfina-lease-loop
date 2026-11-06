import { afterEach, describe, expect, it, vi } from 'vitest';

const { quoteEarlyExitMock } = vi.hoisted(() => ({ quoteEarlyExitMock: vi.fn() }));

vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/lifecycle/early-exit', async () => {
  const { z } = await import('zod');
  return {
    quoteEarlyExit: quoteEarlyExitMock,
    earlyExitQuoteRequestSchema: z.strictObject({
      action: z.enum(['bought', 'returned']),
      requestedOn: z.iso.date(),
    }),
  };
});

import { POST } from './route';

const quote = {
  quote: {
    action: 'returned',
    effectiveOn: '2026-12-05',
    completedMonths: 1,
    remainingMonths: 35,
    remainingRentCents: 375_550,
    annualInterestBasisPoints: 790,
    discountedBalanceCents: 380_000,
    marketValueCents: 200_000,
    marketValueCreditCents: 200_000,
    settlementNetCents: 180_000,
  },
  vatRateBasisPoints: 2_550,
  vatCents: 45_900,
  settlementTotalCents: 225_900,
  asset: { category: 'e_bike', condition: 'good', usageValue: 0 },
};

function request(body: unknown): Request {
  return new Request('http://localhost/api/contracts/contract-1/early-exit/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: 'contract-1' }) };

afterEach(() => quoteEarlyExitMock.mockReset());

describe('POST /api/contracts/:id/early-exit/quote', () => {
  it('returns the explainable quote in the standard envelope', async () => {
    quoteEarlyExitMock.mockResolvedValue({ ok: true, quote });

    const response = await POST(
      request({ action: 'returned', requestedOn: '2026-11-06' }),
      context
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { quote } });
    expect(quoteEarlyExitMock).toHaveBeenCalledWith({}, 'contract-1', {
      action: 'returned',
      requestedOn: '2026-11-06',
    });
  });

  it('validates requests before calculating a quote', async () => {
    const response = await POST(
      request({ action: 'returned', requestedOn: 'not-a-date' }),
      context
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(quoteEarlyExitMock).not.toHaveBeenCalled();
  });
});
