import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuoteData } from '@/domain/pricing/quote';
import type { CreateQuoteResult } from '@/server/quotes/quotes';

const { createQuoteMock } = vi.hoisted(() => ({
  createQuoteMock: vi.fn(),
}));

vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/quotes/quotes', async () => {
  const { z } = await import('zod');
  const { centsSchema, isoDateSchema } = await import('@/data/schemas');
  return {
    createQuote: createQuoteMock,
    quoteRequestSchema: z.strictObject({
      assetId: z.string().min(1),
      date: isoDateSchema,
      downPaymentCents: centsSchema,
      termMonths: z.number().int().positive(),
    }),
  };
});

import { POST } from './route';

const quote: QuoteData = {
  asset: { id: 'ebike-003', status: 'available' },
  pricing: {
    netListPriceCents: 389_000,
    downPaymentCents: 0,
    financedCents: 389_000,
    termMonths: 36,
    coefficientBand: 'B',
    annualInterestBasisPoints: 790,
    monthlyFactor: 0.027584,
    monthlyNetRentCents: 10_730,
    buyoutPercent: 15,
    endOfTermBuyoutCents: 58_350,
    totalCostWithBuyoutCents: 444_630,
  },
  vatPreview: {
    invoiceDate: '2026-11-05',
    ratePercent: 25.5,
    monthlyNetRentCents: 10_730,
    monthlyVatCents: 2_736,
    monthlyGrossRentCents: 13_466,
  },
  sources: {
    priceListVersion: 1,
    coefficientTableId: 'ct-2026-1',
    coefficientTableVersion: 1,
  },
};

function request(body: unknown): Request {
  return new Request('http://localhost/api/quotes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  createQuoteMock.mockReset();
});

describe('POST /api/quotes', () => {
  it('returns the quote in the standard success envelope', async () => {
    createQuoteMock.mockResolvedValue({ ok: true, quote } satisfies CreateQuoteResult);

    const response = await POST(
      request({
        assetId: 'ebike-003',
        date: '2026-11-05',
        downPaymentCents: 0,
        termMonths: 36,
      }),
      undefined
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: quote });
    expect(createQuoteMock).toHaveBeenCalledWith(
      {},
      {
        assetId: 'ebike-003',
        date: '2026-11-05',
        downPaymentCents: 0,
        termMonths: 36,
      }
    );
  });

  it('returns validation errors without calling the quote service', async () => {
    const response = await POST(
      request({
        assetId: 'ebike-003',
        date: '2026-02-30',
        downPaymentCents: 0,
        termMonths: 36,
      }),
      undefined
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(createQuoteMock).not.toHaveBeenCalled();
  });

  it('maps unavailable assets to a stable client error', async () => {
    createQuoteMock.mockResolvedValue({
      ok: false,
      reason: 'asset_unavailable',
      status: 'reserved',
    } satisfies CreateQuoteResult);

    const response = await POST(
      request({
        assetId: 'ebike-003',
        date: '2026-11-05',
        downPaymentCents: 0,
        termMonths: 36,
      }),
      undefined
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'ASSET_UNAVAILABLE', details: { status: 'reserved' } },
    });
  });
});
