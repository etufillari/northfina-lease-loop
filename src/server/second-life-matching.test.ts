import { randomUUID } from 'node:crypto';
import demand from '../../data/second-life-demand.json';
import { secondLifeDemandFileSchema } from '@/data/schemas';
import { loadSecondLifeDemand } from '@/data/load';
import type * as DataLoad from '@/data/load';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { createLease, demoContext, resetSpine } from '../../tests/helpers/spine';
import { matchingPreviewInputSchema, matchingPreviewSchema } from '@/data/second-life-schemas';
import { relistInputSchema, type RelistInput } from './spine-shapes';
import type { PrismaClient } from './prisma-client';
import { previewSecondLife } from './second-life-matching';
import { relistAsset } from './spine-relist';
import { readMaintenance } from './spine-maintenance';
import { createQuote } from './spine-quotes';
import { joinWaitingList, cancelWaitingRequest } from './waiting-list';

vi.mock('@/data/load', async (importOriginal) => {
  const original = await importOriginal<typeof DataLoad>();
  return { ...original, loadSecondLifeDemand: vi.fn(async () => []) };
});

const state = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock('@/server/db', () => ({
  get db() {
    return state.db;
  },
}));
import { POST as matches } from '@/app/api/spine/assets/[id]/matches/route';

let cleanup: () => Promise<void>;
let waitingId: string;
const previewInput = { ageMonths: 24, originalPriceCents: 250000, readyOn: '2026-11-06' };
beforeAll(async () => {
  ({ db: state.db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  vi.mocked(loadSecondLifeDemand).mockResolvedValue([]);
  await resetSpine(state.db);
  const joined = await joinWaitingList(state.db, await demoContext('cust-aino', '2026-11-06'), {
    requestId: randomUUID(),
    category: 'e_bike',
    minCondition: 'fair',
    monthlyBudgetCents: 9000,
    termMonths: 12,
    neededBy: '2026-11-10',
  });
  waitingId = joined.id;
});

async function preparation(assetId = 'ebike-007'): Promise<RelistInput> {
  const context = await demoContext('cust-aino', '2026-11-06', true);
  const result = await previewSecondLife(state.db, context, assetId, previewInput);
  const candidate = result.recommendation!;
  expect(candidate).not.toBeNull();
  return relistInputSchema.parse({
    requestId: randomUUID(),
    releaseRevision: result.releaseRevision,
    netPriceCents: candidate.netPriceCents,
    condition: candidate.condition,
    valuationReason: 'Operator verified first-lease price and age for this synthetic example.',
    completedTaskIds: candidate.tasks.map((task) => task.id),
    matching: {
      ...previewInput,
      waitingRequestId: candidate.requestId,
      waitingRevision: candidate.waitingRevision ?? undefined,
      nextCustomerId: 'cust-aino',
    },
  });
}

describe('matching preview and allocation', () => {
  it('previews through the real route with the API envelope and no writes', async () => {
    const request = new Request('http://localhost/api/spine/assets/ebike-007/matches', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-demo-role': 'operator',
        'x-demo-date': '2026-11-06',
      },
      body: JSON.stringify(previewInput),
    });
    const response = await matches(request, { params: Promise.resolve({ id: 'ebike-007' }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(matchingPreviewSchema.parse(body.data).recommendation).toMatchObject({
      requestId: waitingId,
      customerId: 'cust-aino',
      customerName: 'Aino Virtanen',
      imported: false,
    });
    expect(await state.db.auditLog.count({ where: { action: 'asset.relisted' } })).toBe(0);
    expect(await state.db.assetRelease.count()).toBe(0);
  });

  it('records completed work, allocation and audit atomically, then permits only the selected customer to lease', async () => {
    const context = await demoContext('cust-aino', '2026-11-06', true);
    const input = await preparation();
    const release = await relistAsset(state.db, context, 'ebike-007', input);
    expect(release.offer.priceCents).toBe(67600);
    expect(await relistAsset(state.db, context, 'ebike-007', input)).toEqual(release);
    expect(await state.db.auditLog.count({ where: { action: 'asset.relisted' } })).toBe(1);
    const stored = await state.db.assetRelease.findUniqueOrThrow({
      where: { asset_id: 'ebike-007' },
    });
    expect(stored.reserved_for_customer_id).toBe('cust-aino');
    expect(readMaintenance(stored)).toEqual({ batteryReplacementAtUsage: 18400 });
    const audit = await state.db.auditLog.findFirstOrThrow({ where: { action: 'asset.relisted' } });
    expect(JSON.parse(audit.details_json!).matching.waitingRequestId).toBe(waitingId);
    expect(
      (await state.db.waitingRequest.findUniqueOrThrow({ where: { id: waitingId } })).status
    ).toBe('allocated');
    await expect(cancelWaitingRequest(state.db, context, waitingId)).rejects.toMatchObject({
      code: 'WAITING_REQUEST_CHANGED',
    });
    await expect(
      createQuote(state.db, await demoContext('cust-lena', '2026-11-06'), {
        requestId: randomUUID(),
        assetId: 'ebike-007',
        termMonths: 12,
        downPaymentCents: 0,
        startDate: '2026-11-06',
      })
    ).rejects.toMatchObject({ code: 'ASSET_RESERVED' });
    const contract = await createLease(state.db, await demoContext('cust-aino', '2026-11-06'), {
      assetId: 'ebike-007',
      termMonths: 12,
    });
    expect(contract).toMatchObject({ assetId: 'ebike-007', terms: { listPriceCents: 67600 } });
  });

  it('removes a fulfilled request from subsequent recommendations', async () => {
    const context = await demoContext('cust-aino', '2026-11-06', true);
    await relistAsset(state.db, context, 'ebike-007', await preparation());
    const preview = await previewSecondLife(state.db, context, 'ebike-008', previewInput);
    expect(preview.candidates.some((row) => row.requestId === waitingId)).toBe(false);
  });

  it('does not allocate one waiting request to two items during overlapping confirmations', async () => {
    // Synthetic second physical unit with the same inspection inputs, not a product write.
    await state.db.asset.update({
      where: { id: 'ebike-008' },
      data: { status: 'returned', condition: 'fair', usage_value: 18400 },
    });
    const context = await demoContext('cust-aino', '2026-11-06', true);
    const first = await preparation();
    const second = await preparation('ebike-008');
    const outcomes = await Promise.allSettled([
      relistAsset(state.db, context, 'ebike-007', first),
      relistAsset(state.db, context, 'ebike-008', second),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(await state.db.auditLog.count({ where: { action: 'asset.relisted' } })).toBe(1);
    expect(await state.db.assetRelease.count()).toBe(1);
  });

  it('rejects reusing a committed request identifier with a different customer', async () => {
    const context = await demoContext('cust-aino', '2026-11-06', true);
    const input = await preparation();
    await relistAsset(state.db, context, 'ebike-007', input);
    await expect(
      relistAsset(state.db, context, 'ebike-007', {
        ...input,
        matching: { ...input.matching!, nextCustomerId: 'cust-lena' },
      })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(await state.db.auditLog.count({ where: { action: 'asset.relisted' } })).toBe(1);
  });

  it('does not treat an estimate as completed repairs', async () => {
    const context = await demoContext('cust-aino', '2026-11-06', true);
    await expect(
      relistAsset(state.db, context, 'ebike-007', {
        ...(await preparation()),
        completedTaskIds: [],
      })
    ).rejects.toMatchObject({ code: 'READINESS_INCOMPLETE' });
    expect(await state.db.auditLog.count({ where: { action: 'asset.relisted' } })).toBe(0);
  });

  it('rejects a forged price or changed recommendation without allocating', async () => {
    const context = await demoContext('cust-aino', '2026-11-06', true);
    const input = await preparation();
    await expect(
      relistAsset(state.db, context, 'ebike-007', { ...input, netPriceCents: 1 })
    ).rejects.toMatchObject({ code: 'MATCH_CHANGED' });
    await expect(
      relistAsset(state.db, context, 'ebike-007', {
        ...input,
        matching: { ...input.matching!, waitingRequestId: 'wait-13' },
      })
    ).rejects.toMatchObject({ code: 'MATCH_CHANGED' });
    expect(await state.db.assetRelease.count()).toBe(0);
  });

  it('rejects stale dates, unknown customers and overriding a nominated successor', async () => {
    const context = await demoContext('cust-aino', '2026-11-06', true);
    const input = await preparation();
    await expect(
      relistAsset(state.db, context, 'ebike-007', {
        ...input,
        matching: { ...input.matching!, nextCustomerId: 'cust-lena' },
      })
    ).rejects.toMatchObject({ code: 'MATCH_CHANGED' });
    await expect(
      relistAsset(state.db, context, 'ebike-007', {
        ...input,
        matching: { ...input.matching!, readyOn: '2026-11-07' },
      })
    ).rejects.toMatchObject({ code: 'MATCH_CHANGED' });
    await expect(
      relistAsset(state.db, context, 'ebike-007', {
        ...input,
        matching: { ...input.matching!, nextCustomerId: 'unknown' },
      })
    ).rejects.toMatchObject({ code: 'SUCCESSOR_UNKNOWN' });
    await state.db.assetRelease.create({
      data: { asset_id: 'ebike-007', revision: 0, reserved_for_customer_id: 'cust-lena' },
    });
    await expect(relistAsset(state.db, context, 'ebike-007', input)).rejects.toMatchObject({
      code: 'MATCH_CHANGED',
    });
  });

  it('rolls back repairs and reservation if audit creation fails', async () => {
    const context = await demoContext('cust-aino', '2026-11-06', true);
    const input = await preparation();
    await expect(
      relistAsset(
        state.db,
        { ...context, actor: undefined as unknown as string },
        'ebike-007',
        input
      )
    ).rejects.toThrow();
    expect(await state.db.assetRelease.count()).toBe(0);
    expect(await state.db.auditLog.count({ where: { action: 'asset.relisted' } })).toBe(0);
    expect(
      (await state.db.waitingRequest.findUniqueOrThrow({ where: { id: waitingId } })).status
    ).toBe('pending');
    expect((await state.db.asset.findUniqueOrThrow({ where: { id: 'ebike-007' } })).status).toBe(
      'returned'
    );
  });

  it('rejects non-operators and missing items without leaking internal errors', async () => {
    await expect(
      previewSecondLife(state.db, await demoContext(), 'ebike-007', previewInput)
    ).rejects.toMatchObject({ code: 'OPERATOR_MODE_REQUIRED' });
    const context = await demoContext('cust-aino', '2026-11-06', true);
    await expect(
      previewSecondLife(state.db, context, 'missing', previewInput)
    ).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND' });
    await expect(
      previewSecondLife(state.db, context, 'ebike-007', { ...previewInput, readyOn: '2026-11-05' })
    ).rejects.toMatchObject({ code: 'MATCH_CHANGED' });
  });

  it('validates preview inputs before invoking rules', () => {
    expect(matchingPreviewInputSchema.safeParse(previewInput).success).toBe(true);
    for (const change of [
      { ageMonths: -1 },
      { ageMonths: 1.5 },
      { originalPriceCents: 0 },
      { originalPriceCents: 2_147_483_648 },
      { readyOn: 'bad' },
      { lastServiceUsage: -1 },
      { extra: true },
    ]) {
      expect(matchingPreviewInputSchema.safeParse({ ...previewInput, ...change }).success).toBe(
        false
      );
    }
  });

  it('has no recommendation after the only registered request is cancelled', async () => {
    const context = await demoContext('cust-aino', '2026-11-06', true);
    await cancelWaitingRequest(state.db, context, waitingId);
    const preview = await previewSecondLife(state.db, context, 'ebike-007', previewInput);
    expect(preview.recommendation).toBeNull();
    expect(preview.candidates).toEqual([]);
  });

  it('rejects confirmation after the customer cancels the previewed request', async () => {
    const context = await demoContext('cust-aino', '2026-11-06', true);
    const input = await preparation();
    await cancelWaitingRequest(state.db, context, waitingId);
    await expect(relistAsset(state.db, context, 'ebike-007', input)).rejects.toMatchObject({
      code: 'MATCH_CHANGED',
    });
    expect(await state.db.assetRelease.count()).toBe(0);
  });

  it('does not show requests registered after the simulated business date', async () => {
    const context = await demoContext('cust-aino', '2026-11-05', true);
    expect(
      (
        await previewSecondLife(state.db, context, 'ebike-007', {
          ...previewInput,
          readyOn: '2026-11-05',
        })
      ).recommendation
    ).toBeNull();
  });

  it('keeps a missing customer profile unallocatable rather than guessing an identity', async () => {
    await state.db.waitingRequest.update({
      where: { id: waitingId },
      data: { customer_id: 'removed-profile' },
    });
    const preview = await previewSecondLife(
      state.db,
      await demoContext('cust-aino', '2026-11-06', true),
      'ebike-007',
      previewInput
    );
    expect(preview.recommendation).toMatchObject({ requestId: waitingId, customerId: null });
    expect(
      preview.candidates
        .filter((row) => row.requestId === waitingId)
        .every((row) => row.customerName === null && row.reasons.includes('identity_unknown'))
    ).toBe(true);
  });

  it('explains why a request cannot take an item nominated to someone else', async () => {
    await state.db.assetRelease.create({
      data: { asset_id: 'ebike-007', revision: 0, reserved_for_customer_id: 'cust-lena' },
    });
    const preview = await previewSecondLife(
      state.db,
      await demoContext('cust-aino', '2026-11-06', true),
      'ebike-007',
      previewInput
    );
    expect(preview.recommendation).toBeNull();
    expect(
      preview.candidates
        .filter((row) => row.requestId === waitingId)
        .every((row) => row.reasons.includes('reserved_for_other'))
    ).toBe(true);
  });
});

describe('team-linked data-pack requests', () => {
  beforeEach(async () => {
    await cancelWaitingRequest(state.db, await demoContext('cust-aino', '2026-11-06'), waitingId);
    vi.mocked(loadSecondLifeDemand).mockResolvedValue(secondLifeDemandFileSchema.parse(demand));
  });

  it('keeps exactly one anonymous request and validates optional customer links', () => {
    const requests = secondLifeDemandFileSchema.parse(demand);
    expect(requests.filter((request) => !request.customer_id).map((request) => request.id)).toEqual(
      ['wait-01']
    );
    expect(
      secondLifeDemandFileSchema.safeParse([{ ...requests[0], customer_id: '' }]).success
    ).toBe(false);
  });

  it('shows wait-02 with its demo customer, costs and rent ahead of wait-13', async () => {
    const preview = await previewSecondLife(
      state.db,
      await demoContext('cust-aino', '2026-11-06', true),
      'ebike-007',
      previewInput
    );
    expect(preview.recommendation).toMatchObject({
      requestId: 'wait-02',
      customerId: 'cust-sanna',
      customerName: 'Sanna Mäkelä',
      imported: true,
      condition: 'fair',
      workNetCents: 39500,
      netPriceCents: 67600,
      reasons: [],
      waitingRevision: null,
    });
    expect(preview.recommendation!.monthlyNetCents).toBeGreaterThan(0);
    expect(
      preview.candidates.some((row) => row.requestId === 'wait-13' && row.reasons.length === 0)
    ).toBe(true);
    expect(await state.db.assetRelease.count()).toBe(0);
  });

  async function importedPreparation() {
    const input = await preparation();
    return { ...input, matching: { ...input.matching!, nextCustomerId: 'cust-sanna' } };
  }

  it('allocates a linked sample atomically and never recommends it again', async () => {
    const context = await demoContext('cust-aino', '2026-11-06', true);
    const input = await importedPreparation();
    const result = await relistAsset(state.db, context, 'ebike-007', input);
    expect(await relistAsset(state.db, context, 'ebike-007', input)).toEqual(result);
    expect(
      (await state.db.assetRelease.findUniqueOrThrow({ where: { asset_id: 'ebike-007' } }))
        .reserved_for_customer_id
    ).toBe('cust-sanna');
    expect(await state.db.auditLog.count({ where: { action: 'asset.relisted' } })).toBe(1);
    expect(await state.db.waitingRequest.findUnique({ where: { id: 'wait-02' } })).toBeNull();
    await state.db.asset.update({
      where: { id: 'ebike-008' },
      data: { status: 'returned', condition: 'fair', usage_value: 18400 },
    });
    const next = await previewSecondLife(state.db, context, 'ebike-008', previewInput);
    expect(next.recommendation?.requestId).not.toBe('wait-02');
    expect(
      next.candidates
        .filter((row) => row.requestId === 'wait-02')
        .every((row) => row.reasons.includes('allocated'))
    ).toBe(true);
    const quote = await createQuote(state.db, await demoContext('cust-sanna', '2026-11-06'), {
      requestId: randomUUID(),
      assetId: 'ebike-007',
      termMonths: 12,
      downPaymentCents: 0,
      startDate: '2026-11-06',
    });
    expect(quote.terms.listPriceCents).toBe(67600);
  });

  it('does not allocate one linked sample to two items in competing confirmations', async () => {
    await state.db.asset.update({
      where: { id: 'ebike-008' },
      data: { status: 'returned', condition: 'fair', usage_value: 18400 },
    });
    const context = await demoContext('cust-aino', '2026-11-06', true);
    const first = await importedPreparation();
    const second = {
      ...(await preparation('ebike-008')),
      matching: { ...first.matching! },
      requestId: randomUUID(),
    };
    const results = await Promise.allSettled([
      relistAsset(state.db, context, 'ebike-007', first),
      relistAsset(state.db, context, 'ebike-008', second),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await state.db.assetRelease.count()).toBe(1);
    expect(await state.db.auditLog.count({ where: { action: 'asset.relisted' } })).toBe(1);
  });

  it('rolls back a sample allocation when audit creation fails', async () => {
    const context = await demoContext('cust-aino', '2026-11-06', true);
    const input = await importedPreparation();
    await expect(
      relistAsset(
        state.db,
        { ...context, actor: undefined as unknown as string },
        'ebike-007',
        input
      )
    ).rejects.toThrow();
    expect(await state.db.assetRelease.count()).toBe(0);
    expect(
      (await previewSecondLife(state.db, context, 'ebike-007', previewInput)).recommendation
        ?.requestId
    ).toBe('wait-02');
  });

  it('recommends anonymous wait-01 after earlier deadlines but rejects a forged reservation', async () => {
    const context = await demoContext('cust-aino', '2026-11-11', true);
    const input = { ...previewInput, readyOn: '2026-11-11' };
    const preview = await previewSecondLife(state.db, context, 'ebike-007', input);
    const candidate = preview.recommendation!;
    expect(candidate).toMatchObject({
      requestId: 'wait-01',
      customerId: null,
      customerName: null,
      condition: 'good',
      reasons: ['identity_unknown'],
    });
    expect(candidate.monthlyNetCents).toBeGreaterThan(0);
    await expect(
      relistAsset(state.db, context, 'ebike-007', {
        requestId: randomUUID(),
        releaseRevision: preview.releaseRevision,
        netPriceCents: candidate.netPriceCents!,
        condition: candidate.condition,
        completedTaskIds: candidate.tasks.map((task) => task.id),
        valuationReason: 'Attempt to allocate an anonymous request to an arbitrary customer.',
        matching: { ...input, waitingRequestId: 'wait-01', nextCustomerId: 'cust-aino' },
      })
    ).rejects.toMatchObject({ code: 'MATCH_CHANGED' });
    expect(await state.db.assetRelease.count()).toBe(0);
    expect(await state.db.auditLog.count({ where: { action: 'asset.relisted' } })).toBe(0);
  });

  it('treats an invalid sample customer link as anonymous rather than accepting it', async () => {
    vi.mocked(loadSecondLifeDemand).mockResolvedValue([
      { ...secondLifeDemandFileSchema.parse(demand)[1]!, customer_id: 'missing-customer' },
    ]);
    const preview = await previewSecondLife(
      state.db,
      await demoContext('cust-aino', '2026-11-06', true),
      'ebike-007',
      previewInput
    );
    expect(preview.recommendation).toMatchObject({
      requestId: 'wait-02',
      customerId: null,
      reasons: ['identity_unknown'],
    });
  });

  it('respects an existing reservation for linked and anonymous sample requests', async () => {
    await state.db.assetRelease.create({
      data: {
        asset_id: 'ebike-007',
        revision: 0,
        reserved_for_customer_id: 'cust-lena',
      },
    });
    const preview = await previewSecondLife(
      state.db,
      await demoContext('cust-aino', '2026-11-06', true),
      'ebike-007',
      previewInput
    );
    expect(
      preview.candidates
        .filter((row) => ['wait-01', 'wait-02'].includes(row.requestId))
        .every((row) => row.reasons.includes('reserved_for_other'))
    ).toBe(true);
    expect(preview.recommendation?.customerId).toBe('cust-lena');
  });
});
