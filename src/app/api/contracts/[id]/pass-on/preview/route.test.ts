import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as PassOnModule from '@/server/lifecycle/pass-on';

const { previewPassOnMock } = vi.hoisted(() => ({ previewPassOnMock: vi.fn() }));

vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/lifecycle/pass-on', async (importOriginal) => ({
  ...(await importOriginal<typeof PassOnModule>()),
  previewPassOn: previewPassOnMock,
}));

import { POST } from './route';

function call(body: unknown) {
  return POST(
    new Request('http://localhost/api/contracts/contract-1/pass-on/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'contract-1' }) }
  );
}

const validBody = { condition: 'good', usageValue: 1200, handoverOn: '2026-11-06' };

describe('POST /api/contracts/:id/pass-on/preview', () => {
  beforeEach(() => previewPassOnMock.mockReset());

  it('returns only the options the customer needs', async () => {
    previewPassOnMock.mockResolvedValue({
      ok: true,
      handedOverAsset: { id: 'internal' },
      mandatorySteps: [],
      waitingList: [],
      named: null,
    });

    const response = await call(validBody);

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
      mandatorySteps: [],
      waitingList: [],
      named: null,
    });
  });

  it('rejects a bad body before calling the service', async () => {
    const response = await call({ ...validBody, condition: 'shiny' });

    expect(response.status).toBe(400);
    expect(previewPassOnMock).not.toHaveBeenCalled();
  });

  it.each([
    ['contract_not_found', {}, 404, 'CONTRACT_NOT_FOUND'],
    ['contract_not_active', { status: 'completed' }, 422, 'CONTRACT_NOT_ACTIVE'],
    ['condition_above_recorded', { recorded: 'fair' }, 422, 'CONDITION_ABOVE_RECORDED'],
    ['usage_below_recorded', { recorded: 10 }, 422, 'USAGE_BELOW_RECORDED'],
    ['original_price_not_found', {}, 422, 'PASS_ON_NOT_PRICEABLE'],
  ])('maps %s to a stable error', async (reason, extra, status, code) => {
    previewPassOnMock.mockResolvedValue({ ok: false, reason, ...extra });

    const response = await call(validBody);

    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  });
});
