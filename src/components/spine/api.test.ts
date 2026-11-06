import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { requestJson } from './api';
import { quoteViewSchema } from '@/data/spine-response-schemas';

const meta = { timestamp: '2026-11-05T10:00:00.000Z' };
const selection = { customerId: 'cust-aino', businessDate: '2026-11-05' };
const quote = {
  id: '11111111-1111-4111-8111-111111111111',
  customerId: 'cust-aino',
  assetId: 'ebike-003',
  pricedOn: '2026-11-05',
  startDate: '2026-11-05',
  validThrough: '2026-11-05',
  priceSource: 'list:1',
  terms: {
    listPriceCents: 389000,
    downPaymentCents: 0,
    financedCents: 389000,
    termMonths: 36,
    coefficientTableId: 'ct-2026-1',
    coefficientTableVersion: 1,
    band: 'B',
    factorMillionths: 27584,
    monthlyNetCents: 10730,
    buyoutNetCents: 58350,
    totalRentNetCents: 386280,
  },
};
function respond(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body, { status })));
}
afterEach(() => vi.unstubAllGlobals());

describe('validated API transport', () => {
  it('returns a real validated quote including nested numeric terms', async () => {
    respond({ success: true, data: quote, meta });
    await expect(requestJson('quotes/x', selection, quoteViewSchema)).resolves.toEqual(quote);
  });
  it.each([
    null,
    [],
    { success: true },
    { success: true, meta },
    { success: 'true', data: quote, meta },
    { success: true, data: quote, meta: { timestamp: 'not-a-date' } },
    {
      success: true,
      data: { ...quote, terms: { ...quote.terms, monthlyNetCents: '10730' } },
      meta,
    },
    { success: true, data: { ...quote, terms: { ...quote.terms, monthlyNetCents: 10.5 } }, meta },
  ])('rejects an invalid envelope or nested payload', async (body) => {
    respond(body);
    await expect(requestJson('quotes/x', selection, quoteViewSchema)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
  it('handles a non-JSON proxy/error page without leaking its text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('SQL /private/path', { status: 502 }))
    );
    await expect(requestJson('quotes/x', selection, quoteViewSchema)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      message: 'INVALID_RESPONSE',
    });
  });
  it('keeps valid server refusal codes but rejects contradictory HTTP/envelope states', async () => {
    respond(
      { success: false, error: { code: 'QUOTE_EXPIRED', message: 'private detail' }, meta },
      409
    );
    await expect(requestJson('quotes/x', selection, quoteViewSchema)).rejects.toMatchObject({
      code: 'QUOTE_EXPIRED',
    });
    respond({ success: false, error: { code: 'QUOTE_EXPIRED' }, meta });
    await expect(requestJson('quotes/x', selection, quoteViewSchema)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    respond({ success: true, data: quote, meta }, 500);
    await expect(requestJson('quotes/x', selection, quoteViewSchema)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
  it('never promotes a customer request to the dealer role', async () => {
    respond({ success: true, data: {}, meta });
    await expect(
      requestJson('assets/a/relist', selection, z.object({}), {}, true)
    ).rejects.toMatchObject({ code: 'OPERATOR_MODE_REQUIRED' });
    expect(fetch).not.toHaveBeenCalled();
    await requestJson('quotes/x', selection, z.object({}));
    expect(fetch).toHaveBeenCalledWith(
      '/api/spine/quotes/x',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-demo-role': 'customer',
          'x-demo-customer': 'cust-aino',
        }),
      })
    );
  });
  it('preserves POST intent, demo headers and cancellation without adding retries', async () => {
    respond({ success: true, data: {}, meta });
    const controller = new AbortController();
    await requestJson(
      'assets/a/relist',
      { ...selection, role: 'operator' },
      z.object({}),
      { requestId: 'same-key' },
      true,
      controller.signal
    );
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(new Headers(init?.headers).has('x-demo-customer')).toBe(false);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      '/api/spine/assets/a/relist',
      expect.objectContaining({
        method: 'POST',
        signal: controller.signal,
        body: '{"requestId":"same-key"}',
        headers: expect.objectContaining({
          'x-demo-role': 'operator',
        }),
      })
    );
  });
});
