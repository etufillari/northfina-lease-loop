import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { demoContext, resetSpine } from '../../tests/helpers/spine';
import type { PrismaClient } from './prisma-client';
import { previewSecondLife } from './second-life-matching';
import { relistAsset } from './spine-relist';
import { relistInputSchema, type RelistInput } from './spine-shapes';
import { joinWaitingList, cancelWaitingRequest } from './waiting-list';
import { updateWaitingRequest } from './waiting-list-update';

let db: PrismaClient;
let cleanup: () => Promise<void>;
const previewInput = { ageMonths: 24, originalPriceCents: 250000, readyOn: '2026-11-06' };
const reason = 'The customer confirmed collection today and requested this repair plan.';
beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetSpine(db);
});

async function alternativeInput(
  requestId = 'wait-13',
  assetId = 'ebike-007'
): Promise<RelistInput> {
  const preview = await previewSecondLife(
    db,
    await demoContext('cust-aino', '2026-11-06', true),
    assetId,
    previewInput
  );
  const candidate = preview.candidates.find(
    (row) => row.requestId === requestId && row.condition === 'good' && row.reasons.length === 0
  )!;
  return relistInputSchema.parse({
    requestId: randomUUID(),
    releaseRevision: preview.releaseRevision,
    netPriceCents: candidate.netPriceCents,
    condition: candidate.condition,
    completedTaskIds: candidate.tasks.map((task) => task.id),
    valuationReason: 'Verified synthetic age and original price for this demonstration.',
    matching: {
      ...previewInput,
      waitingRequestId: requestId,
      nextCustomerId: candidate.customerId,
      waitingRevision: candidate.waitingRevision ?? undefined,
      overrideReason: reason,
    },
  });
}

describe('audited second-life operator overrides', () => {
  it('allocates an eligible runner-up and records the explanation and original recommendation', async () => {
    const context = await demoContext('cust-aino', '2026-11-06', true);
    const input = await alternativeInput();
    const result = await relistAsset(db, context, 'ebike-007', input);
    expect(await relistAsset(db, context, 'ebike-007', input)).toEqual(result);
    expect(
      (await db.assetRelease.findUniqueOrThrow({ where: { asset_id: 'ebike-007' } }))
        .reserved_for_customer_id
    ).toBe('cust-olavi');
    const audits = await db.auditLog.findMany({ where: { action: 'asset.relisted' } });
    expect(audits).toHaveLength(1);
    expect(JSON.parse(audits[0]!.details_json!)).toMatchObject({
      matching: {
        waitingRequestId: 'wait-13',
        nextCustomerId: 'cust-olavi',
        overrideReason: reason,
      },
      condition: 'good',
      matchingDecision: {
        override: true,
        recommended: { requestId: 'wait-02', condition: 'fair' },
      },
    });
  });

  it('rejects a runner-up without an explanation, even when called outside the UI', async () => {
    const input = await alternativeInput();
    await expect(
      relistAsset(db, await demoContext('cust-aino', '2026-11-06', true), 'ebike-007', {
        ...input,
        matching: { ...input.matching!, overrideReason: undefined },
      })
    ).rejects.toMatchObject({ code: 'MATCH_CHANGED' });
    expect(await db.assetRelease.count()).toBe(0);
    for (const invalid of [' ', 'too short', 'x'.repeat(501)]) {
      expect(
        relistInputSchema.safeParse({
          ...input,
          matching: { ...input.matching!, overrideReason: invalid },
        }).success
      ).toBe(false);
    }
  });

  it('allows a different eligible condition for the same customer with a reason', async () => {
    const input = await alternativeInput('wait-02');
    await relistAsset(db, await demoContext('cust-aino', '2026-11-06', true), 'ebike-007', input);
    expect((await db.asset.findUniqueOrThrow({ where: { id: 'ebike-007' } })).condition).toBe(
      'good'
    );
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'asset.relisted' } });
    expect(JSON.parse(audit.details_json!).matchingDecision.override).toBe(true);
  });

  it('rejects forged prices and incomplete repairs for an otherwise eligible override', async () => {
    const input = await alternativeInput();
    const context = await demoContext('cust-aino', '2026-11-06', true);
    await expect(
      relistAsset(db, context, 'ebike-007', { ...input, netPriceCents: 1 })
    ).rejects.toMatchObject({ code: 'MATCH_CHANGED' });
    await expect(
      relistAsset(db, context, 'ebike-007', { ...input, completedTaskIds: [] })
    ).rejects.toMatchObject({ code: 'READINESS_INCOMPLETE' });
    expect(await db.assetRelease.count()).toBe(0);
  });

  it('does not use an explanation to bypass identity, budget, deadlines or condition', async () => {
    const input = await alternativeInput();
    const context = await demoContext('cust-aino', '2026-11-06', true);
    for (const [id, customerId, condition] of [
      ['wait-01', 'cust-aino', 'good'],
      ['wait-05', 'cust-norvi', 'good'],
      ['wait-13', 'cust-olavi', 'fair'],
    ] as const) {
      await expect(
        relistAsset(db, context, 'ebike-007', {
          ...input,
          condition,
          matching: { ...input.matching!, waitingRequestId: id, nextCustomerId: customerId },
        })
      ).rejects.toMatchObject({ code: 'MATCH_CHANGED' });
    }
    await expect(
      relistAsset(db, await demoContext('cust-aino', '2026-11-11', true), 'ebike-007', {
        ...input,
        matching: { ...input.matching!, readyOn: '2026-11-11' },
      })
    ).rejects.toMatchObject({ code: 'MATCH_CHANGED' });
    expect(await db.assetRelease.count()).toBe(0);
  });

  it('revalidates cancellation and edits of a registered alternative', async () => {
    const customer = await demoContext('cust-lena', '2026-11-06');
    const preferences = {
      requestId: randomUUID(),
      category: 'e_bike' as const,
      minCondition: 'good' as const,
      monthlyBudgetCents: 9000,
      termMonths: 24,
      neededBy: '2026-11-15',
    };
    const { id } = await joinWaitingList(db, customer, preferences);
    const input = await alternativeInput(id);
    await updateWaitingRequest(db, customer, id, {
      ...preferences,
      requestId: randomUUID(),
      revision: 0,
      monthlyBudgetCents: 9500,
    });
    const operator = await demoContext('cust-aino', '2026-11-06', true);
    await expect(relistAsset(db, operator, 'ebike-007', input)).rejects.toMatchObject({
      code: 'MATCH_CHANGED',
    });
    const fresh = await alternativeInput(id);
    await cancelWaitingRequest(db, customer, id);
    await expect(relistAsset(db, operator, 'ebike-007', fresh)).rejects.toMatchObject({
      code: 'MATCH_CHANGED',
    });
    expect(await db.assetRelease.count()).toBe(0);
  });

  it('allocates a registered alternative and locks its waiting request', async () => {
    const { id } = await joinWaitingList(db, await demoContext('cust-lena', '2026-11-06'), {
      requestId: randomUUID(),
      category: 'e_bike',
      minCondition: 'good',
      monthlyBudgetCents: 9000,
      termMonths: 24,
      neededBy: '2026-11-15',
    });
    await relistAsset(
      db,
      await demoContext('cust-aino', '2026-11-06', true),
      'ebike-007',
      await alternativeInput(id)
    );
    expect(await db.waitingRequest.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: 'allocated',
      allocated_asset_id: 'ebike-007',
    });
  });

  it('rolls the override back if its audit cannot be written', async () => {
    const context = await demoContext('cust-aino', '2026-11-06', true);
    await expect(
      relistAsset(
        db,
        { ...context, actor: undefined as unknown as string },
        'ebike-007',
        await alternativeInput()
      )
    ).rejects.toThrow();
    expect(await db.assetRelease.count()).toBe(0);
    expect((await db.asset.findUniqueOrThrow({ where: { id: 'ebike-007' } })).status).toBe(
      'returned'
    );
  });

  it('prevents competing overrides from allocating the same sample twice', async () => {
    await db.asset.update({
      where: { id: 'ebike-008' },
      data: { status: 'returned', condition: 'fair', usage_value: 18400 },
    });
    const first = await alternativeInput();
    const second = await alternativeInput('wait-13', 'ebike-008');
    const operator = await demoContext('cust-aino', '2026-11-06', true);
    const results = await Promise.allSettled([
      relistAsset(db, operator, 'ebike-007', first),
      relistAsset(db, operator, 'ebike-008', second),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.auditLog.count({ where: { action: 'asset.relisted' } })).toBe(1);
  });
});
