import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { demoContext, resetSpine } from '../../tests/helpers/spine';
import type { PrismaClient } from './prisma-client';
import { joinWaitingList, cancelWaitingRequest } from './waiting-list';
import { updateWaitingRequest } from './waiting-list-update';
import { previewSecondLife } from './second-life-matching';
import { relistAsset } from './spine-relist';

const state = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock('@/server/db', () => ({
  get db() {
    return state.db;
  },
}));
import { POST } from '@/app/api/spine/waiting-list/[id]/update/route';
let cleanup: () => Promise<void>;
let id: string;
const prefs = {
  minCondition: 'fair' as const,
  monthlyBudgetCents: 9000,
  termMonths: 12,
  // Earlier than the imported examples so these tests exercise the registered request.
  neededBy: '2026-11-09',
};
const previewInput = { ageMonths: 24, originalPriceCents: 250000, readyOn: '2026-11-06' };
function edit() {
  return { ...prefs, requestId: randomUUID(), revision: 0, monthlyBudgetCents: 10000 };
}
beforeAll(async () => {
  ({ db: state.db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetSpine(state.db);
  id = (
    await joinWaitingList(state.db, await demoContext('cust-aino', '2026-11-06'), {
      ...prefs,
      category: 'e_bike',
      requestId: randomUUID(),
    })
  ).id;
});

describe('editing a pending waiting request', () => {
  it('updates through the route and preserves identity, category and original signup date', async () => {
    const input = { ...edit(), minCondition: 'good', termMonths: 24, neededBy: '2026-11-20' };
    const response = await POST(
      new Request('http://localhost/api/spine/waiting-list/' + id + '/update', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-demo-customer': 'cust-aino',
          'x-demo-date': '2026-11-07',
        },
        body: JSON.stringify(input),
      }),
      { params: Promise.resolve({ id }) }
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { id } });
    expect(await state.db.waitingRequest.findUniqueOrThrow({ where: { id } })).toMatchObject({
      id,
      customer_id: 'cust-aino',
      category: 'e_bike',
      submitted_on: '2026-11-06',
      revision: 1,
      min_condition: 'good',
      max_monthly_net_rent_cents: 10000,
      preferred_term_months: 24,
      needed_by: '2026-11-20',
      status: 'pending',
    });
    const audit = await state.db.auditLog.findFirstOrThrow({
      where: { action: 'waiting.updated' },
    });
    expect(JSON.parse(audit.details_json!)).toMatchObject({
      before: { monthlyBudgetCents: 9000 },
      after: { monthlyBudgetCents: 10000 },
    });
    expect(await state.db.waitingRequest.count()).toBe(1);
  });
  it('rejects edits by another customer, unsupported terms and expired deadlines', async () => {
    const context = await demoContext('cust-aino', '2026-11-06');
    await expect(
      updateWaitingRequest(state.db, await demoContext('cust-lena'), id, edit())
    ).rejects.toMatchObject({ code: 'WAITING_REQUEST_NOT_FOUND' });
    for (const change of [{ termMonths: 18 }, { neededBy: '2026-11-05' }]) {
      await expect(
        updateWaitingRequest(state.db, context, id, { ...edit(), ...change })
      ).rejects.toMatchObject({ code: 'WAITING_INPUT_INVALID' });
    }
    expect(await state.db.auditLog.count({ where: { action: 'waiting.updated' } })).toBe(0);
  });
  it('does not accept customer or category changes in the edit API', async () => {
    const response = await POST(
      new Request('http://localhost/api/spine/waiting-list/' + id + '/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-demo-date': '2026-11-06' },
        body: JSON.stringify({ ...edit(), category: 'laptop' }),
      }),
      { params: Promise.resolve({ id }) }
    );
    expect(response.status).toBe(400);
  });
  it('deduplicates the same edit and detects reuse with changed preferences', async () => {
    const context = await demoContext('cust-aino', '2026-11-06');
    const input = edit();
    await updateWaitingRequest(state.db, context, id, input);
    expect(await updateWaitingRequest(state.db, context, id, input)).toEqual({ id });
    await expect(
      updateWaitingRequest(state.db, context, id, { ...input, monthlyBudgetCents: 11000 })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(await state.db.auditLog.count({ where: { action: 'waiting.updated' } })).toBe(1);
  });

  it('returns the same result for overlapping retries of one edit', async () => {
    const context = await demoContext('cust-aino', '2026-11-06');
    const input = edit();
    const results = await Promise.all([
      updateWaitingRequest(state.db, context, id, input),
      updateWaitingRequest(state.db, context, id, input),
    ]);
    expect(results).toEqual([{ id }, { id }]);
    expect((await state.db.waitingRequest.findUniqueOrThrow({ where: { id } })).revision).toBe(1);
    expect(await state.db.auditLog.count({ where: { action: 'waiting.updated' } })).toBe(1);
  });

  it('does not let an old registration retry reset edited preferences', async () => {
    const context = await demoContext('cust-aino', '2026-11-06');
    await updateWaitingRequest(state.db, context, id, edit());
    expect(
      await joinWaitingList(state.db, context, { ...prefs, category: 'e_bike', requestId: id })
    ).toEqual({ id });
    expect(await state.db.waitingRequest.findUniqueOrThrow({ where: { id } })).toMatchObject({
      revision: 1,
      max_monthly_net_rent_cents: 10000,
    });
    expect(await state.db.waitingRequest.count()).toBe(1);
  });

  it('does not edit a request before its recorded signup date', async () => {
    await expect(
      updateWaitingRequest(state.db, await demoContext('cust-aino', '2026-11-05'), id, edit())
    ).rejects.toMatchObject({ code: 'WAITING_REQUEST_CHANGED' });
    expect((await state.db.waitingRequest.findUniqueOrThrow({ where: { id } })).revision).toBe(0);
  });
  it('does not overwrite a newer edit or modify a cancelled request', async () => {
    const context = await demoContext('cust-aino', '2026-11-06');
    await updateWaitingRequest(state.db, context, id, edit());
    await expect(updateWaitingRequest(state.db, context, id, edit())).rejects.toMatchObject({
      code: 'WAITING_REQUEST_CHANGED',
    });
    await cancelWaitingRequest(state.db, context, id);
    await expect(
      updateWaitingRequest(state.db, context, id, { ...edit(), revision: 1 })
    ).rejects.toMatchObject({ code: 'WAITING_REQUEST_CHANGED' });
  });
  it('permits only one of two overlapping edits from the same revision', async () => {
    const context = await demoContext('cust-aino', '2026-11-06');
    const outcomes = await Promise.allSettled([
      updateWaitingRequest(state.db, context, id, edit()),
      updateWaitingRequest(state.db, context, id, { ...edit(), monthlyBudgetCents: 11000 }),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await state.db.auditLog.count({ where: { action: 'waiting.updated' } })).toBe(1);
  });
  it('rolls preferences and revision back if the audit fails', async () => {
    const context = await demoContext('cust-aino', '2026-11-06');
    await expect(
      updateWaitingRequest(
        state.db,
        { ...context, actor: undefined as unknown as string },
        id,
        edit()
      )
    ).rejects.toThrow();
    expect(await state.db.waitingRequest.findUniqueOrThrow({ where: { id } })).toMatchObject({
      revision: 0,
      max_monthly_net_rent_cents: 9000,
    });
  });
  it('invalidates an old recommendation even when the new budget still qualifies', async () => {
    const context = await demoContext('cust-aino', '2026-11-06', true);
    const candidate = (await previewSecondLife(state.db, context, 'ebike-007', previewInput))
      .recommendation!;
    await updateWaitingRequest(state.db, context, id, edit());
    await expect(
      relistAsset(state.db, context, 'ebike-007', {
        requestId: randomUUID(),
        releaseRevision: 0,
        condition: candidate.condition,
        netPriceCents: candidate.netPriceCents!,
        valuationReason: 'Verified synthetic first-lease inputs.',
        completedTaskIds: candidate.tasks.map((task) => task.id),
        matching: {
          ...previewInput,
          waitingRequestId: id,
          waitingRevision: candidate.waitingRevision!,
          nextCustomerId: 'cust-aino',
        },
      })
    ).rejects.toMatchObject({ code: 'MATCH_CHANGED' });
    expect(await state.db.assetRelease.count()).toBe(0);
  });
  it('locks an allocated request against editing', async () => {
    const context = await demoContext('cust-aino', '2026-11-06', true);
    const candidate = (await previewSecondLife(state.db, context, 'ebike-007', previewInput))
      .recommendation!;
    await relistAsset(state.db, context, 'ebike-007', {
      requestId: randomUUID(),
      releaseRevision: 0,
      condition: candidate.condition,
      netPriceCents: candidate.netPriceCents!,
      valuationReason: 'Verified synthetic first-lease inputs.',
      completedTaskIds: candidate.tasks.map((task) => task.id),
      matching: {
        ...previewInput,
        waitingRequestId: id,
        waitingRevision: candidate.waitingRevision!,
        nextCustomerId: 'cust-aino',
      },
    });
    await expect(updateWaitingRequest(state.db, context, id, edit())).rejects.toMatchObject({
      code: 'WAITING_REQUEST_CHANGED',
    });
  });
});
