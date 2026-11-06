import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from './prisma-client';
import { createTestDb } from '../../tests/helpers/test-db';
import { demoContext, prepareApplication, resetSpine } from '../../tests/helpers/spine';

// Only the process singleton is replaced; every route still uses a real migrated database.
const state = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock('@/server/db', () => ({
  get db() {
    return state.db;
  },
}));

import { GET as bootstrap } from '@/app/api/spine/bootstrap/route';
import { POST as postQuote } from '@/app/api/spine/quotes/route';
import { GET as getQuote } from '@/app/api/spine/quotes/[id]/route';
import { GET as getApplication } from '@/app/api/spine/applications/[id]/route';
import { PATCH as oldStatus } from '@/app/api/assets/[id]/status/route';
import { GET as oldAudit } from '@/app/api/audit-log/route';
import { readDemoContext } from './demo-context';

let cleanup: () => Promise<void>;
beforeAll(async () => {
  const fixture = await createTestDb();
  state.db = fixture.db;
  cleanup = fixture.cleanup;
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetSpine(state.db);
});

function request(
  path: string,
  body?: unknown,
  customerId = 'cust-aino',
  origin = 'http://localhost'
) {
  return new Request(`http://localhost${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      'x-demo-customer': customerId,
      'x-demo-date': '2026-11-05',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('HTTP contract', () => {
  it('provides selected persona, sourced price and the real question bank in the envelope', async () => {
    const response = await bootstrap(request('/api/spine/bootstrap?assetId=ebike-003'), undefined);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      data: {
        businessDate: '2026-11-05',
        simulated: true,
        customer: { id: 'cust-aino' },
        asset: { id: 'ebike-003' },
        offer: { priceCents: 389000, source: 'list:1' },
      },
    });
    expect(body.data.questions).toHaveLength(18);
    expect(body.meta.timestamp).toEqual(expect.any(String));
  });

  it('persists through POST and reads the canonical quote back with ownership scoping', async () => {
    const input = {
      requestId: randomUUID(),
      assetId: 'ebike-003',
      termMonths: 36,
      downPaymentCents: 0,
      startDate: '2026-11-05',
    };
    const created = await postQuote(request('/api/spine/quotes', input), undefined);
    const body = await created.json();
    expect(created.status).toBe(200);
    expect(body.data.terms.monthlyNetCents).toBe(10730);
    const params = { params: Promise.resolve({ id: body.data.id }) };
    const own = await getQuote(request(`/api/spine/quotes/${body.data.id}`), params);
    expect((await own.json()).data).toEqual(body.data);
    const other = await getQuote(
      request(`/api/spine/quotes/${body.data.id}`, undefined, 'cust-lena'),
      params
    );
    expect(other.status).toBe(404);
    expect((await other.json()).error.code).toBe('QUOTE_NOT_FOUND');
  });

  it('refuses cross-origin writes and fractional cents before they can affect data', async () => {
    const input = {
      requestId: randomUUID(),
      assetId: 'ebike-003',
      termMonths: 36,
      downPaymentCents: 0,
      startDate: '2026-11-05',
    };
    const crossed = await postQuote(
      request('/api/spine/quotes', input, 'cust-aino', 'https://unrelated.example'),
      undefined
    );
    expect(crossed.status).toBe(403);
    expect((await crossed.json()).error.code).toBe('ORIGIN_REJECTED');
    const fraction = await postQuote(
      request('/api/spine/quotes', { ...input, downPaymentCents: 0.5 }),
      undefined
    );
    expect(fraction.status).toBe(400);
    expect((await fraction.json()).error.code).toBe('VALIDATION_ERROR');
    expect(await state.db.quote.count()).toBe(0);
  });

  it.each([
    { businessDate: '2026-11-05', startDate: '9997-01-01' },
    { businessDate: '9999-12-31', startDate: '9999-12-31' },
  ])('rejects an unrepresentable lease before saving it: $startDate', async (dates) => {
    const input = {
      requestId: randomUUID(),
      assetId: 'ebike-003',
      termMonths: 36,
      downPaymentCents: 0,
      startDate: dates.startDate,
    };
    const command = request('/api/spine/quotes', input);
    command.headers.set('x-demo-date', dates.businessDate);
    const response = await postQuote(command, undefined);
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe('INVALID_START_DATE');
    expect(await state.db.quote.count()).toBe(0);
    expect(await state.db.auditLog.count()).toBe(0);
  });

  it('rejects a demo date outside the domain calendar before any write', async () => {
    const command = request('/api/spine/quotes', {
      requestId: randomUUID(),
      assetId: 'ebike-003',
      termMonths: 36,
      downPaymentCents: 0,
      startDate: '2026-11-05',
    });
    command.headers.set('x-demo-date', '0000-01-01');
    const response = await postQuote(command, undefined);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
    expect(await state.db.quote.count()).toBe(0);
    expect(await state.db.auditLog.count()).toBe(0);
  });

  it('maps malformed JSON to the common safe error envelope', async () => {
    const malformed = new Request('http://localhost/api/spine/quotes', {
      method: 'POST',
      body: '{',
    });
    const response = await postQuote(malformed, undefined);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'INVALID_JSON' },
      meta: { timestamp: expect.any(String) },
    });
  });

  it('reads only the selected persona application and scopes the old audit endpoint too', async () => {
    const { application } = await prepareApplication(state.db, await demoContext());
    const params = { params: Promise.resolve({ id: application.id }) };
    const own = await getApplication(request(`/api/spine/applications/${application.id}`), params);
    expect((await own.json()).data.id).toBe(application.id);
    const other = await getApplication(
      request(`/api/spine/applications/${application.id}`, undefined, 'cust-lena'),
      params
    );
    expect(other.status).toBe(404);
    const audit = await oldAudit(request('/api/audit-log', undefined, 'cust-lena'), undefined);
    expect((await audit.json()).data).toEqual([]);
  });

  it('retires the arbitrary status setter without changing the item', async () => {
    const response = await oldStatus(
      new Request('http://localhost/api/assets/ebike-003/status', { method: 'PATCH' }),
      undefined
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('STATUS_ROUTE_RETIRED');
    expect((await state.db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } })).status).toBe(
      'available'
    );
    expect(await state.db.auditLog.count()).toBe(0);
  });
});

it('validates demo context and distinguishes an explicit simulated date from today', async () => {
  expect((await readDemoContext(new Request('http://localhost/'))).simulated).toBe(false);
  const badCustomer = new Request('http://localhost/', {
    headers: { 'x-demo-customer': 'missing' },
  });
  await expect(readDemoContext(badCustomer)).rejects.toMatchObject({
    code: 'DEMO_CUSTOMER_UNKNOWN',
  });
  const badRole = new Request('http://localhost/', { headers: { 'x-demo-role': 'admin' } });
  await expect(readDemoContext(badRole)).rejects.toMatchObject({ code: 'DEMO_ROLE_UNKNOWN' });
  const operator = new Request('http://localhost/', {
    headers: { 'x-demo-role': 'operator', 'x-demo-date': '2026-11-05' },
  });
  expect(await readDemoContext(operator)).toMatchObject({
    operator: true,
    simulated: true,
    actor: 'demo:operator:dealer',
  });
});
