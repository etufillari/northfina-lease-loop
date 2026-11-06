import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { NextRequest } from 'next/server';
import { loadCustomers } from '@/data/load';
import { handleRoute, ok } from './api-response';
import {
  checkRequestOrigin,
  readDemoContext,
  requireCustomer,
  requireOperator,
} from './demo-context';

afterEach(() => vi.useRealTimers());

function request(headers: Record<string, string> = {}) {
  return new Request('https://lease.example.test/api/spine', { method: 'POST', headers });
}

describe('demo context', () => {
  it('defaults to the first synthetic customer, customer mode and the Helsinki date', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T22:30:00Z'));
    const customers = await loadCustomers();
    const result = await readDemoContext(request());
    expect(result).toEqual({
      customer: customers[0],
      businessDate: '2026-11-06',
      simulated: false,
      operator: false,
      actor: `demo:customer:${customers[0]!.id}`,
    });
    expect(() => requireCustomer(result)).not.toThrow();
  });

  it('uses a distinct dealer actor rather than impersonating the selected customer', async () => {
    const result = await readDemoContext(
      request({
        'x-demo-customer': 'cust-norvi',
        'x-demo-date': '2028-02-29',
        'x-demo-role': 'operator',
      })
    );
    expect(result.customer.id).toBe('cust-norvi');
    expect(result).toMatchObject({
      businessDate: '2028-02-29',
      simulated: true,
      operator: true,
      actor: 'demo:operator:dealer',
    });
    expect(() => requireOperator(result)).not.toThrow();
    expect(() => requireCustomer(result)).toThrow(
      expect.objectContaining({ status: 403, code: 'CUSTOMER_MODE_REQUIRED' })
    );
  });

  it('marks an explicitly supplied current date as simulated', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T12:00:00Z'));
    expect((await readDemoContext(request({ 'x-demo-date': '2026-11-05' }))).simulated).toBe(true);
  });

  it.each(['missing-customer', ''])(
    'rejects an unknown or empty customer ID: %s',
    async (value) => {
      await expect(readDemoContext(request({ 'x-demo-customer': value }))).rejects.toMatchObject({
        status: 400,
        code: 'DEMO_CUSTOMER_UNKNOWN',
      });
    }
  );

  it.each(['admin', 'Operator', ''])('rejects an unsupported demo role: %s', async (value) => {
    await expect(readDemoContext(request({ 'x-demo-role': value }))).rejects.toMatchObject({
      status: 400,
      code: 'DEMO_ROLE_UNKNOWN',
    });
  });

  it.each(['2026-02-29', '2026-11-05T12:00:00Z', '05.11.2026', ''])(
    'rejects an invalid business date: %s',
    async (value) => {
      await expect(readDemoContext(request({ 'x-demo-date': value }))).rejects.toBeInstanceOf(
        ZodError
      );
    }
  );

  it('rejects operator-only actions in customer mode through the shared API envelope', async () => {
    const handler = handleRoute(async (req) => {
      const context = await readDemoContext(req);
      requireOperator(context);
      return ok({ accepted: true });
    });
    const response = await handler(request(), undefined);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'OPERATOR_MODE_REQUIRED' },
    });
  });
});

describe('browser request origin', () => {
  it('accepts the matching origin and an absent Origin header', () => {
    expect(() =>
      checkRequestOrigin(request({ origin: 'https://lease.example.test' }))
    ).not.toThrow();
    expect(() => checkRequestOrigin(request())).not.toThrow();
  });

  it.each([
    'https://other.example.test',
    'http://lease.example.test',
    'https://lease.example.test:444',
    'https://lease.example.test.other.test',
    'https://lease.example.test/path',
    'https://user@lease.example.test',
    'null',
    '',
  ])('rejects a different or invalid origin: %s', (origin) => {
    expect(() => checkRequestOrigin(request({ origin }))).toThrow(
      expect.objectContaining({ status: 403, code: 'ORIGIN_REJECTED' })
    );
  });

  it.each(['http://127.0.0.1:42109', 'http://[::1]:42109', 'http://localhost:42109'])(
    'accepts the actual request host after Next normalizes %s',
    (origin) => {
      const req = new NextRequest(origin + '/api/spine', {
        method: 'POST',
        headers: { origin, host: new URL(origin).host },
      });
      expect(() => checkRequestOrigin(req)).not.toThrow();
    }
  );

  it('uses the request host when Next exposes a different bind hostname', () => {
    const req = new NextRequest('http://0.0.0.0:42109/api/spine', {
      method: 'POST',
      headers: { origin: 'http://lease.example.test', host: 'lease.example.test' },
    });
    expect(() => checkRequestOrigin(req)).not.toThrow();
  });

  it.each(['http://localhost:42109', 'http://other.example.test'])(
    'does not allow a different origin or spoofed forwarded host: %s',
    (origin) => {
      const req = new NextRequest('http://127.0.0.1:42109/api/spine', {
        method: 'POST',
        headers: { origin, host: '127.0.0.1:42109', 'x-forwarded-host': new URL(origin).host },
      });
      expect(() => checkRequestOrigin(req)).toThrow(
        expect.objectContaining({ status: 403, code: 'ORIGIN_REJECTED' })
      );
    }
  );
});
