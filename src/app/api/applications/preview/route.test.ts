import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationPreviewResult } from '@/server/applications';
import type { QuoteData } from '@/domain/quote';

const { createApplicationPreviewMock } = vi.hoisted(() => ({
  createApplicationPreviewMock: vi.fn(),
}));

vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/applications', async () => {
  const { z } = await import('zod');
  const { centsSchema, isoDateSchema } = await import('@/data/schemas');
  return {
    createApplicationPreview: createApplicationPreviewMock,
    applicationPreviewRequestSchema: z.strictObject({
      assetId: z.string().min(1),
      date: isoDateSchema,
      downPaymentCents: centsSchema,
      termMonths: z.number().int().positive(),
      answers: z
        .record(z.string(), z.union([z.string(), z.number(), z.array(z.string())]))
        .default({}),
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
  return new Request('http://localhost/api/applications/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  createApplicationPreviewMock.mockReset();
});

describe('POST /api/applications/preview', () => {
  it('returns the preview in the standard success envelope', async () => {
    const preview = {
      quote,
      application: {
        decision: 'incomplete' as const,
        reasons: [],
        activeQuestions: [],
        retainedAnswers: {},
        discardedAnswerIds: [],
        missingQuestionIds: ['q_customer_type'],
        nextQuestionId: 'q_customer_type',
      },
    };
    createApplicationPreviewMock.mockResolvedValue({
      ok: true,
      preview,
    } satisfies ApplicationPreviewResult);

    const response = await POST(
      request({
        assetId: 'ebike-003',
        date: '2026-11-05',
        downPaymentCents: 0,
        termMonths: 36,
        answers: {},
      }),
      undefined
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: preview });
    expect(createApplicationPreviewMock).toHaveBeenCalledWith(
      {},
      {
        assetId: 'ebike-003',
        date: '2026-11-05',
        downPaymentCents: 0,
        termMonths: 36,
        answers: {},
      }
    );
  });

  it('returns validation errors without calling the application service', async () => {
    const response = await POST(
      request({
        assetId: 'ebike-003',
        date: '2026-02-30',
        downPaymentCents: 0,
        termMonths: 36,
        answers: {},
      }),
      undefined
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(createApplicationPreviewMock).not.toHaveBeenCalled();
  });

  it('maps unavailable assets to the stable quote error', async () => {
    createApplicationPreviewMock.mockResolvedValue({
      ok: false,
      reason: 'asset_unavailable',
      status: 'reserved',
    } satisfies ApplicationPreviewResult);

    const response = await POST(
      request({
        assetId: 'ebike-003',
        date: '2026-11-05',
        downPaymentCents: 0,
        termMonths: 36,
        answers: {},
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
