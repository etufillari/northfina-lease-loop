import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { demoContext, resetSpine } from '../../tests/helpers/spine';
import { ownWaitingListSchema } from '@/data/waiting-list-schemas';
import type { PrismaClient } from './prisma-client';
import { cancelWaitingRequest, joinWaitingList, listOwnWaitingRequests } from './waiting-list';

const state = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock('@/server/db', () => ({
  get db() {
    return state.db;
  },
}));
import { GET, POST } from '@/app/api/spine/waiting-list/route';
import { POST as cancel } from '@/app/api/spine/waiting-list/[id]/cancel/route';
import { POST as update } from '@/app/api/spine/waiting-list/[id]/update/route';

let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db: state.db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetSpine(state.db);
});
function input() {
  return {
    requestId: randomUUID(),
    category: 'e_bike' as const,
    minCondition: 'fair' as const,
    monthlyBudgetCents: 9000,
    termMonths: 12,
    neededBy: '2026-11-10',
  };
}
function request(body?: unknown, customer = 'cust-aino') {
  return new Request('http://localhost/api/spine/waiting-list', {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      'x-demo-date': '2026-11-06',
      'x-demo-customer': customer,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('customer-owned waiting requests', () => {
  it('rejects cross-origin registration, editing and cancellation before writing data', async () => {
    const joined = await joinWaitingList(
      state.db,
      await demoContext('cust-aino', '2026-11-06'),
      input()
    );
    const forged = () =>
      new Request('http://localhost/api/spine/waiting-list', {
        method: 'POST',
        headers: { origin: 'https://example.test', 'content-type': 'application/json' },
        body: '{}',
      });
    const params = { params: Promise.resolve({ id: joined.id }) };
    const responses = await Promise.all([
      POST(forged(), undefined),
      update(forged(), params),
      cancel(forged(), params),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        success: false,
        error: { code: 'ORIGIN_REJECTED' },
      });
    }
    expect(await state.db.auditLog.count()).toBe(1);
    expect(
      (await state.db.waitingRequest.findUniqueOrThrow({ where: { id: joined.id } })).status
    ).toBe('pending');
  });
  it('registers through the route, derives ownership from context and writes one audit', async () => {
    const body = input();
    const response = await POST(request(body), undefined);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { id: body.requestId } });
    expect(
      await state.db.waitingRequest.findUniqueOrThrow({ where: { id: body.requestId } })
    ).toMatchObject({
      customer_id: 'cust-aino',
      status: 'pending',
      submitted_on: '2026-11-06',
      max_monthly_net_rent_cents: 9000,
    });
    expect(await state.db.auditLog.count({ where: { action: 'waiting.joined' } })).toBe(1);
    expect(await state.db.assetRelease.count()).toBe(0);
    expect(await state.db.application.count()).toBe(0);
  });
  it('returns only the selected customer’s requests', async () => {
    const aino = await demoContext('cust-aino', '2026-11-06');
    const lena = await demoContext('cust-lena', '2026-11-06');
    const first = await joinWaitingList(state.db, aino, input());
    await joinWaitingList(state.db, lena, input());
    const response = await GET(request(), undefined);
    const records = ownWaitingListSchema.parse((await response.json()).data);
    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe(first.id);
    expect(await listOwnWaitingRequests(state.db, await demoContext('cust-mikko'))).toEqual([]);
  });
  it('rejects an injected customer ID and malformed preferences', async () => {
    for (const change of [
      { customerId: 'cust-lena' },
      { monthlyBudgetCents: 0.5 },
      { minCondition: 'poor' },
    ]) {
      expect((await POST(request({ ...input(), ...change }), undefined)).status).toBe(400);
    }
    expect(await state.db.waitingRequest.count()).toBe(0);
  });
  it('checks deadlines and supported terms on the server', async () => {
    const context = await demoContext('cust-aino', '2026-11-06');
    for (const change of [{ neededBy: '2026-11-05' }, { termMonths: 18 }]) {
      await expect(
        joinWaitingList(state.db, context, { ...input(), ...change })
      ).rejects.toMatchObject({ code: 'WAITING_INPUT_INVALID' });
    }
    expect(await state.db.auditLog.count()).toBe(0);
  });
  it('deduplicates retries and detects changed payloads', async () => {
    const context = await demoContext('cust-aino', '2026-11-06');
    const body = input();
    const first = await joinWaitingList(state.db, context, body);
    expect(await joinWaitingList(state.db, context, body)).toEqual(first);
    await expect(
      joinWaitingList(state.db, context, { ...body, monthlyBudgetCents: 10000 })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(
      joinWaitingList(state.db, await demoContext('cust-lena'), body)
    ).rejects.toMatchObject({ code: 'WAITING_REQUEST_NOT_FOUND' });
    expect(await state.db.waitingRequest.count()).toBe(1);
    expect(await state.db.auditLog.count()).toBe(1);
  });
  it('allows only one pending request per customer and category', async () => {
    const context = await demoContext('cust-aino', '2026-11-06');
    await joinWaitingList(state.db, context, input());
    await expect(joinWaitingList(state.db, context, input())).rejects.toMatchObject({
      code: 'WAITING_REQUEST_EXISTS',
    });
  });

  it('keeps overlapping registrations to one pending request and one audit', async () => {
    const context = await demoContext('cust-aino', '2026-11-06');
    const outcomes = await Promise.allSettled([
      joinWaitingList(state.db, context, input()),
      joinWaitingList(state.db, context, input()),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(await state.db.waitingRequest.count()).toBe(1);
    expect(await state.db.auditLog.count()).toBe(1);
  });
  it('cancels only an owned pending request and permits joining again', async () => {
    const context = await demoContext('cust-aino', '2026-11-06');
    const joined = await joinWaitingList(state.db, context, input());
    await expect(
      cancelWaitingRequest(state.db, await demoContext('cust-lena'), joined.id)
    ).rejects.toMatchObject({ code: 'WAITING_REQUEST_NOT_FOUND' });
    const response = await cancel(request({}), { params: Promise.resolve({ id: joined.id }) });
    expect(response.status).toBe(200);
    expect(await cancelWaitingRequest(state.db, context, joined.id)).toEqual(joined);
    expect(await state.db.auditLog.count({ where: { action: 'waiting.cancelled' } })).toBe(1);
    await joinWaitingList(state.db, context, input());
    expect(await state.db.waitingRequest.count({ where: { status: 'pending' } })).toBe(1);
  });
  it('rolls registration and cancellation back if the audit fails', async () => {
    const context = await demoContext('cust-aino', '2026-11-06');
    const invalid = { ...context, actor: undefined as unknown as string };
    await expect(joinWaitingList(state.db, invalid, input())).rejects.toThrow();
    expect(await state.db.waitingRequest.count()).toBe(0);
    const joined = await joinWaitingList(state.db, context, input());
    await expect(cancelWaitingRequest(state.db, invalid, joined.id)).rejects.toThrow();
    expect(
      (await state.db.waitingRequest.findUniqueOrThrow({ where: { id: joined.id } })).status
    ).toBe('pending');
  });
});
