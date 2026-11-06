import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { createLease, demoContext, resetSpine } from '../../tests/helpers/spine';
import { valuationBaselineSchema } from '@/data/valuation-baseline-schemas';
import { matchingPreviewInputSchema, matchingPreviewSchema } from '@/data/second-life-schemas';
import { wholeMonthsSince } from '@/domain/valuation-baseline';
import type { PrismaClient } from './prisma-client';
import { readValuationBaseline, matchingValuationBaseline } from './valuation-baseline';
import { previewSecondLife } from './second-life-matching';
import { getDealerWorkspace } from './spine-dealer';
import { relistAsset } from './spine-relist';
import { issueInvoices } from './spine-invoices';
import { endLease } from './spine-end';

let db: PrismaClient;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetSpine(db);
});
const automatic = {
  useAutomaticBaseline: true,
  readyOn: '2026-11-06',
  ageMonths: 46,
  originalPriceCents: 549000,
};
const correction = {
  firstUsedOn: '2024-11-06',
  originalPriceCents: 250000,
  reason: 'Verified original invoice and first-use record for this synthetic demonstration.',
};
const corrected = {
  ...automatic,
  ageMonths: 24,
  originalPriceCents: 250000,
  baselineCorrection: correction,
};

async function preparation(input = corrected) {
  const context = await demoContext('cust-aino', '2026-11-06', true);
  const preview = await previewSecondLife(db, context, 'ebike-007', input);
  const candidate = preview.recommendation!;
  return {
    requestId: randomUUID(),
    releaseRevision: preview.releaseRevision,
    netPriceCents: candidate.netPriceCents!,
    condition: candidate.condition,
    completedTaskIds: candidate.tasks.map((task) => task.id),
    valuationReason: 'Residual-curve suggestion using the saved original valuation reference.',
    matching: {
      ...input,
      waitingRequestId: candidate.requestId,
      waitingRevision: candidate.waitingRevision ?? undefined,
      nextCustomerId: candidate.customerId!,
    },
  };
}

describe('automatic original valuation references', () => {
  it('provides labelled v1 defaults without writing on read or preview', async () => {
    const context = await demoContext('cust-aino', '2026-11-06', true);
    const workspace = await getDealerWorkspace(db, context, 'ebike-007');
    expect(workspace.valuationBaseline).toEqual({
      firstUsedOn: '2023-01-01',
      originalPriceCents: 549000,
      source: 'imported_assumption',
      reason: null,
    });
    expect(
      matchingPreviewSchema.parse(await previewSecondLife(db, context, 'ebike-007', automatic))
        .valuationBaseline
    ).toEqual(workspace.valuationBaseline);
    expect(await db.auditLog.count()).toBe(0);
    expect(
      (await db.asset.findUniqueOrThrow({ where: { id: 'ebike-007' } })).valuation_baseline_json
    ).toBeNull();
    expect(
      await matchingValuationBaseline(db, 'ebike-007', {
        ...automatic,
        readyOn: '2026-12-06',
        ageMonths: 47,
      })
    ).toMatchObject({ ageMonths: 47, originalPriceCents: 549000 });
  });

  it('rejects tampered or stale automatic age and original price', async () => {
    for (const change of [{ ageMonths: 0 }, { originalPriceCents: 1 }]) {
      await expect(
        matchingValuationBaseline(db, 'ebike-007', { ...automatic, ...change })
      ).rejects.toMatchObject({ code: 'MATCH_CHANGED' });
    }
  });

  it('only saves a correction when the confirmed plan is published, together with its audit', async () => {
    const context = await demoContext('cust-aino', '2026-11-06', true);
    const input = await preparation();
    expect(
      (await db.asset.findUniqueOrThrow({ where: { id: 'ebike-007' } })).valuation_baseline_json
    ).toBeNull();
    await relistAsset(db, context, 'ebike-007', input);
    const baseline = await readValuationBaseline(db, 'ebike-007');
    expect(baseline).toEqual({ ...correction, source: 'operator_verified' });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'asset.relisted' } });
    expect(JSON.parse(audit.details_json!).valuationBaseline).toEqual(baseline);
    expect(await relistAsset(db, context, 'ebike-007', input)).toBeDefined();
    expect(await db.auditLog.count({ where: { action: 'asset.relisted' } })).toBe(1);
  });

  it('rolls back a correction if the audit fails', async () => {
    const context = await demoContext('cust-aino', '2026-11-06', true);
    await expect(
      relistAsset(
        db,
        { ...context, actor: undefined as unknown as string },
        'ebike-007',
        await preparation()
      )
    ).rejects.toThrow();
    expect(
      (await db.asset.findUniqueOrThrow({ where: { id: 'ebike-007' } })).valuation_baseline_json
    ).toBeNull();
    expect((await readValuationBaseline(db, 'ebike-007'))?.source).toBe('imported_assumption');
  });

  it('persists the true first-lease start and locked price for a new item', async () => {
    const first = await createLease(db, await demoContext(), { termMonths: 12 });
    expect(await readValuationBaseline(db, first.assetId)).toEqual({
      firstUsedOn: first.startDate,
      originalPriceCents: first.terms.listPriceCents,
      source: 'recorded_lease',
      reason: null,
    });
    // Simulate a migrated database whose original contract predates the baseline column.
    await db.asset.update({
      where: { id: first.assetId },
      data: { valuation_baseline_json: null },
    });
    expect((await readValuationBaseline(db, first.assetId))?.firstUsedOn).toBe(first.startDate);
  });

  it('keeps original facts through return, manual repricing and a second signed lease', async () => {
    const aino = await demoContext();
    const first = await createLease(db, aino, { termMonths: 12 });
    const original = await readValuationBaseline(db, first.assetId);
    const end = { ...aino, businessDate: first.endDate };
    await issueInvoices(db, end, first.id);
    await endLease(db, end, first.id, {
      requestId: randomUUID(),
      choice: 'return',
      condition: 'good',
      usageValue: 1000,
    });
    await relistAsset(
      db,
      { ...end, operator: true, actor: 'demo:operator:dealer' },
      first.assetId,
      {
        requestId: randomUUID(),
        releaseRevision: 1,
        netPriceCents: 130000,
        valuationReason: 'Synthetic new-life price, not the original purchase price.',
        condition: 'good',
        completedTaskIds: ['safety_inspection'],
      }
    );
    const second = await createLease(db, await demoContext('cust-lena', first.endDate), {
      termMonths: 12,
    });
    expect(second.terms.listPriceCents).toBe(130000);
    expect(await readValuationBaseline(db, first.assetId)).toEqual(original);
    expect(wholeMonthsSince(original!.firstUsedOn, second.endDate)).toBe(24);
  });

  it('preserves a corrected imported baseline across a later agreement and return', async () => {
    const operator = await demoContext('cust-aino', '2026-11-06', true);
    await relistAsset(db, operator, 'ebike-007', await preparation());
    const original = await readValuationBaseline(db, 'ebike-007');
    const next = await createLease(db, await demoContext('cust-sanna', '2026-11-06'), {
      assetId: 'ebike-007',
      termMonths: 12,
    });
    const end = await demoContext('cust-sanna', next.endDate);
    await issueInvoices(db, end, next.id);
    await endLease(db, end, next.id, {
      requestId: randomUUID(),
      choice: 'return',
      condition: 'fair',
      usageValue: 18500,
    });
    expect(await readValuationBaseline(db, 'ebike-007')).toEqual(original);
    const workspace = await getDealerWorkspace(db, { ...end, operator: true }, 'ebike-007');
    expect(workspace.valuationBaseline).toEqual(original);
    expect(wholeMonthsSince(original!.firstUsedOn, next.endDate)).toBe(36);
  });

  it('does not replace an imported baseline with the next lease price or edited model year', async () => {
    const input = await preparation();
    await relistAsset(db, await demoContext('cust-aino', '2026-11-06', true), 'ebike-007', input);
    await db.asset.update({ where: { id: 'ebike-007' }, data: { model_year: 2026 } });
    expect(
      await readValuationBaseline(db, 'ebike-007', {
        startDate: '2030-01-01',
        originalPriceCents: 10000,
      })
    ).toEqual({ ...correction, source: 'operator_verified' });
  });

  it('labels legacy manual inputs as assumptions and never resets a saved baseline with them', async () => {
    expect(
      await matchingValuationBaseline(db, 'ebike-007', {
        ageMonths: 24,
        originalPriceCents: 250000,
        readyOn: '2026-11-06',
      })
    ).toMatchObject({ baseline: { source: 'operator_assumption', firstUsedOn: '2024-11-06' } });
    await relistAsset(
      db,
      await demoContext('cust-aino', '2026-11-06', true),
      'ebike-007',
      await preparation()
    );
    expect((await readValuationBaseline(db, 'ebike-007'))?.source).toBe('operator_verified');
  });

  it('blocks future baselines and missing original prices until explicitly corrected', async () => {
    await expect(
      matchingValuationBaseline(db, 'ebike-007', {
        ...automatic,
        ageMonths: 0,
        baselineCorrection: { ...correction, firstUsedOn: '2027-01-01' },
      })
    ).rejects.toMatchObject({ code: 'VALUATION_BASELINE_UNAVAILABLE' });
    const row = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-007' } });
    await db.asset.create({
      data: { ...row, id: 'missing-price', serial_number: 'TEST-NO-PRICE' },
    });
    expect(await readValuationBaseline(db, 'missing-price')).toBeNull();
    await expect(matchingValuationBaseline(db, 'missing-price', automatic)).rejects.toMatchObject({
      code: 'VALUATION_BASELINE_UNAVAILABLE',
    });
    expect(await matchingValuationBaseline(db, 'missing-price', corrected)).toMatchObject({
      baseline: { source: 'operator_verified' },
    });
  });

  it('validates correction date, cents and a meaningful explanation', () => {
    expect(matchingPreviewInputSchema.safeParse(corrected).success).toBe(true);
    for (const invalid of [
      { firstUsedOn: '2026-02-30' },
      { originalPriceCents: 1.5 },
      { originalPriceCents: 0 },
      { reason: '   ' },
      { reason: 'x'.repeat(501) },
    ]) {
      expect(
        matchingPreviewInputSchema.safeParse({
          ...corrected,
          baselineCorrection: { ...correction, ...invalid },
        }).success
      ).toBe(false);
    }
    expect(valuationBaselineSchema.safeParse({ ...correction, source: 'invented' }).success).toBe(
      false
    );
  });
});
