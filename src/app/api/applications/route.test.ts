import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationSubmissionResult, SubmittedApplication } from '@/server/applications';

const { createApplicationMock } = vi.hoisted(() => ({
  createApplicationMock: vi.fn(),
}));

vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/applications', async () => {
  const { z } = await import('zod');
  const { centsSchema, isoDateSchema } = await import('@/data/schemas');
  return {
    createApplication: createApplicationMock,
    applicationSubmissionRequestSchema: z.strictObject({
      customerId: z.string().min(1),
      assetId: z.string().min(1),
      date: isoDateSchema,
      downPaymentCents: centsSchema,
      termMonths: z.number().int().positive(),
      answers: z
        .record(z.string(), z.union([z.string(), z.number(), z.array(z.string())]))
        .default({}),
      actor: z.string().trim().min(1).max(100),
    }),
  };
});

import { POST } from './route';

const application: SubmittedApplication = {
  id: 'application-1',
  customerId: 'cust-aino',
  assetId: 'ebike-003',
  decision: 'approved',
  requestedTermMonths: 36,
  downPaymentCents: 0,
  startDate: '2026-11-05',
  answers: { q_customer_type: 'consumer' },
  reasons: [],
  decisionAt: '2026-11-05T16:00:00.000Z',
  pricingSnapshot: {} as SubmittedApplication['pricingSnapshot'],
};

function request(body: unknown): Request {
  return new Request('http://localhost/api/applications', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  customerId: 'cust-aino',
  assetId: 'ebike-003',
  date: '2026-11-05',
  downPaymentCents: 0,
  termMonths: 36,
  answers: { q_customer_type: 'consumer' },
  actor: 'team-test',
};

afterEach(() => {
  createApplicationMock.mockReset();
});

describe('POST /api/applications', () => {
  it('returns a created application in the standard success envelope', async () => {
    createApplicationMock.mockResolvedValue({
      ok: true,
      application,
    } satisfies ApplicationSubmissionResult);

    const response = await POST(request(validBody), undefined);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { application },
    });
    expect(createApplicationMock).toHaveBeenCalledWith({}, validBody);
  });

  it('returns validation errors without calling the application service', async () => {
    const response = await POST(request({ ...validBody, actor: '' }), undefined);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(createApplicationMock).not.toHaveBeenCalled();
  });

  it('maps missing customers to a stable error', async () => {
    createApplicationMock.mockResolvedValue({
      ok: false,
      reason: 'customer_not_found',
    } satisfies ApplicationSubmissionResult);

    const response = await POST(request(validBody), undefined);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'CUSTOMER_NOT_FOUND' },
    });
  });

  it('returns missing questions for incomplete applications', async () => {
    createApplicationMock.mockResolvedValue({
      ok: false,
      reason: 'incomplete',
      missingQuestionIds: ['q_customer_type'],
    } satisfies ApplicationSubmissionResult);

    const response = await POST(request(validBody), undefined);

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      success: false,
      error: {
        code: 'APPLICATION_INCOMPLETE',
        details: { missingQuestionIds: ['q_customer_type'] },
      },
    });
  });
});
