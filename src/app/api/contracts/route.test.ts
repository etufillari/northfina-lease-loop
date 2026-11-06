import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContractCreationResult, CreatedContract } from '@/server/contracts/contracts';

const { createContractMock } = vi.hoisted(() => ({
  createContractMock: vi.fn(),
}));

vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/contracts/contracts', async () => {
  const { z } = await import('zod');
  const { isoDateSchema } = await import('@/data/schemas');
  return {
    createContract: createContractMock,
    contractCreationRequestSchema: z.strictObject({
      applicationId: z.string().min(1),
      signedOn: isoDateSchema,
      actor: z.string().trim().min(1).max(100),
    }),
  };
});

import { POST } from './route';

const contract: CreatedContract = {
  id: 'contract-1',
  applicationId: 'application-1',
  assetId: 'ebike-003',
  status: 'active',
  signedOn: '2026-11-06',
  startsOn: '2026-11-05',
  endsOn: '2029-11-05',
  termMonths: 36,
  downPaymentCents: 0,
  listPriceCents: 389_000,
  financedAmountCents: 389_000,
  priceListVersion: 1,
  coefficientBand: 'B',
  coefficientFactorPpm: 27_584,
  monthlyNetRentCents: 10_730,
  buyoutCents: 58_350,
  pricingSnapshot: {} as CreatedContract['pricingSnapshot'],
};

const validBody = {
  applicationId: 'application-1',
  signedOn: '2026-11-06',
  actor: 'team-test',
};

function request(body: unknown): Request {
  return new Request('http://localhost/api/contracts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  createContractMock.mockReset();
});

describe('POST /api/contracts', () => {
  it('returns the active contract in the standard success envelope', async () => {
    createContractMock.mockResolvedValue({
      ok: true,
      contract,
    } satisfies ContractCreationResult);

    const response = await POST(request(validBody), undefined);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { contract },
    });
    expect(createContractMock).toHaveBeenCalledWith({}, validBody);
  });

  it('returns validation errors without calling the service', async () => {
    const response = await POST(request({ ...validBody, signedOn: '2026-02-30' }), undefined);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(createContractMock).not.toHaveBeenCalled();
  });

  it('maps an application that is not approved', async () => {
    createContractMock.mockResolvedValue({
      ok: false,
      reason: 'application_not_approved',
      status: 'manual_review',
    } satisfies ContractCreationResult);

    const response = await POST(request(validBody), undefined);

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'APPLICATION_NOT_APPROVED', details: { status: 'manual_review' } },
    });
  });

  it('maps an unavailable asset', async () => {
    createContractMock.mockResolvedValue({
      ok: false,
      reason: 'asset_unavailable',
      status: 'reserved',
    } satisfies ContractCreationResult);

    const response = await POST(request(validBody), undefined);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'ASSET_UNAVAILABLE', details: { status: 'reserved' } },
    });
  });
});
