import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadRefurbishmentCosts } from '@/data/load';
import { refurbishmentPlan } from '@/domain/lifecycle';
import { createTestDb } from '../../tests/helpers/test-db';
import { createLease, demoContext, resetSpine } from '../../tests/helpers/spine';
import { toAsset } from './assets';
import type { DemoContext } from './demo-context';
import type { PrismaClient } from './prisma-client';
import { endLease } from './spine-end';
import { getPassport, getScopedAudit } from './spine-history';
import { issueInvoices } from './spine-invoices';
import { cataloguePrices } from './spine-offers';
import { getDealerWorkspace } from './spine-dealer';
import { createQuote } from './spine-quotes';
import { relistAsset } from './spine-relist';
import { getContract } from './spine-views';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let aino: DemoContext;
beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetSpine(db);
  aino = await demoContext();
});

async function returned(choice: 'return' | 'pass_on' = 'return') {
  const contract = await createLease(db, aino, { termMonths: 12 });
  const endContext = { ...aino, businessDate: contract.endDate };
  await issueInvoices(db, endContext, contract.id);
  const input = {
    requestId: randomUUID(),
    choice,
    condition: 'fair' as const,
    usageValue: 18400,
    ...(choice === 'pass_on' ? { nextCustomerId: 'cust-lena' } : {}),
  };
  const closed = await endLease(db, endContext, contract.id, input);
  return { contract, endContext, input, closed };
}

async function relistInput(assetId = 'ebike-003') {
  const asset = toAsset(await db.asset.findUniqueOrThrow({ where: { id: assetId } }));
  const plan = refurbishmentPlan({
    asset,
    targetCondition: 'good',
    costs: await loadRefurbishmentCosts(),
  });
  if (!plan.ok) throw new Error('Expected available service plan');
  const release = await db.assetRelease.findUnique({ where: { asset_id: assetId } });
  return {
    requestId: randomUUID(),
    releaseRevision: release?.revision ?? 0,
    netPriceCents: 130000,
    valuationReason: 'Synthetic operator valuation after condition inspection.',
    condition: 'good' as const,
    completedTaskIds: plan.tasks.map((task) => task.id),
  };
}

describe('the complete loop', () => {
  it('returns, inspects, reprices and makes a distinct agreement for the same physical item', async () => {
    const { contract, endContext, input, closed } = await returned();
    expect(closed.status).toBe('returned');
    expect(
      await endLease(db, { ...endContext, businessDate: '2027-12-01' }, contract.id, input)
    ).toEqual(closed);
    expect(
      (await db.asset.findUniqueOrThrow({ where: { id: contract.assetId } })).previous_lives
    ).toBe(1);
    expect(await db.assetLease.count()).toBe(0);

    const operator = { ...endContext, operator: true, actor: 'demo:operator:cust-aino' };
    const preparation = await relistInput();
    const release = await relistAsset(db, operator, contract.assetId, preparation);
    expect(release.offer).toEqual({ priceCents: 130000, source: 'release:1', releaseRevision: 1 });
    expect(await relistAsset(db, operator, contract.assetId, preparation)).toEqual(release);
    expect((await cataloguePrices(db, endContext.businessDate))[contract.assetId]?.priceCents).toBe(
      130000
    );
    expect(
      (await db.asset.findUniqueOrThrow({ where: { id: contract.assetId } })).usage_value
    ).toBe(18400);

    const lena = await demoContext('cust-lena', endContext.businessDate);
    const second = await createLease(db, lena, { termMonths: 24 });
    expect(second.id).not.toBe(contract.id);
    expect(second).toMatchObject({
      assetId: contract.assetId,
      lifeNumber: 2,
      terms: { listPriceCents: 130000 },
    });
    expect((await getContract(db, aino, contract.id)).terms).toEqual(contract.terms);
    const passport = await getPassport(db, contract.assetId);
    expect(passport.lives).toHaveLength(2);
    expect(passport.earlierLivesWithoutRecords).toBe(0);
    const publicHistory = JSON.stringify(passport);
    expect(publicHistory).not.toContain('cust-aino');
    expect(publicHistory).not.toContain(contract.id);
    expect(publicHistory).not.toContain(aino.customer.email);
    expect(await db.auditLog.count({ where: { action: 'asset.relisted' } })).toBe(1);

    // A third life must preserve the component service baseline across another return.
    const secondEnd = { ...lena, businessDate: second.endDate };
    await issueInvoices(db, secondEnd, second.id);
    await endLease(db, secondEnd, second.id, {
      requestId: randomUUID(),
      choice: 'return',
      condition: 'good',
      usageValue: 18500,
    });
    const nextOperator = { ...secondEnd, operator: true, actor: 'demo:operator:cust-lena' };
    const boot = await getDealerWorkspace(db, nextOperator, contract.assetId);
    expect(boot.maintenance).toEqual({ batteryReplacementAtUsage: 18400 });
    expect(
      refurbishmentPlan({
        asset: boot.asset,
        targetCondition: 'good',
        costs: boot.refurbishmentCosts,
        maintenance: boot.maintenance,
      })
    ).toMatchObject({ ok: true, tasks: [{ id: 'safety_inspection' }] });
    await expect(
      relistAsset(db, nextOperator, contract.assetId, preparation)
    ).rejects.toMatchObject({ code: 'RELIST_NOT_ALLOWED' });
    await relistAsset(db, nextOperator, contract.assetId, await relistInput());
    const third = await createLease(db, await demoContext('cust-olavi', second.endDate), {
      termMonths: 12,
    });
    expect(third.lifeNumber).toBe(3);
    expect((await getPassport(db, contract.assetId)).lives).toHaveLength(3);
  });

  it('passes on through nomination and a new application, never by changing the old customer', async () => {
    const { contract, endContext } = await returned('pass_on');
    const operator = { ...endContext, operator: true, actor: 'demo:operator:cust-aino' };
    await relistAsset(db, operator, contract.assetId, await relistInput());
    const quoteInput = {
      requestId: randomUUID(),
      assetId: contract.assetId,
      termMonths: 24,
      downPaymentCents: 0,
      startDate: endContext.businessDate,
    };
    await expect(createQuote(db, endContext, quoteInput)).rejects.toMatchObject({
      code: 'ASSET_RESERVED',
    });
    const second = await createLease(db, await demoContext('cust-lena', endContext.businessDate), {
      termMonths: 24,
    });
    const original = await db.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(original).toMatchObject({
      customer_id: 'cust-aino',
      status: 'passed_on',
      next_customer_id: 'cust-lena',
    });
    expect(second.id).not.toBe(contract.id);
  });

  it('buys at the locked price without replacing inspection data and prevents relisting', async () => {
    const contract = await createLease(db, aino, { assetId: 'ebike-005', termMonths: 12 });
    const assetBefore = await db.asset.findUniqueOrThrow({ where: { id: contract.assetId } });
    const endContext = { ...aino, businessDate: contract.endDate };
    await issueInvoices(db, endContext, contract.id);
    const input = {
      requestId: randomUUID(),
      choice: 'buy' as const,
      condition: 'poor' as const,
      usageValue: 0,
    };
    const bought = await endLease(db, endContext, contract.id, input);
    expect(bought.status).toBe('bought');
    expect(bought.invoices.find((invoice) => invoice.kind === 'buyout')).toMatchObject({
      netCents: 63600,
      vatCents: 16536,
      grossCents: 80136,
    });
    expect(await db.asset.findUniqueOrThrow({ where: { id: contract.assetId } })).toMatchObject({
      condition: assetBefore.condition,
      usage_value: assetBefore.usage_value,
      previous_lives: assetBefore.previous_lives + 1,
      status: 'reserved',
    });
    expect(await endLease(db, endContext, contract.id, input)).toEqual(bought);
    expect(await db.invoice.count({ where: { contract_id: contract.id, kind: 'buyout' } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: 'contract.bought' } })).toBe(1);
    await expect(
      endLease(db, endContext, contract.id, { ...input, choice: 'return' })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(await db.assetLease.count()).toBe(0);
    await expect(
      relistAsset(
        db,
        { ...endContext, operator: true },
        contract.assetId,
        await relistInput(contract.assetId)
      )
    ).rejects.toMatchObject({ code: 'RELIST_NOT_ALLOWED' });
  });
});

describe('lifecycle guards and evidence', () => {
  it.each(['return', 'pass_on'] as const)(
    'rejects a lower inspection reading for %s without changing records',
    async (choice) => {
      const contract = await createLease(db, aino, { assetId: 'ebike-005', termMonths: 12 });
      const endContext = { ...aino, businessDate: contract.endDate };
      await issueInvoices(db, endContext, contract.id);
      const assetBefore = await db.asset.findUniqueOrThrow({ where: { id: contract.assetId } });
      const auditsBefore = await db.auditLog.count();
      await expect(
        endLease(db, endContext, contract.id, {
          requestId: randomUUID(),
          choice,
          condition: 'poor',
          usageValue: 0,
          ...(choice === 'pass_on' ? { nextCustomerId: 'cust-lena' } : {}),
        })
      ).rejects.toMatchObject({ code: 'END_NOT_ALLOWED', details: { reason: 'usage_decreased' } });
      expect(await db.asset.findUniqueOrThrow({ where: { id: contract.assetId } })).toEqual(
        assetBefore
      );
      expect((await getContract(db, endContext, contract.id)).status).toBe('active');
      expect(await db.auditLog.count()).toBe(auditsBefore);
      expect(await db.assetLease.count()).toBe(1);
    }
  );

  it('blocks an early end and does not change money, status or audit', async () => {
    const contract = await createLease(db, aino);
    const auditsBefore = await db.auditLog.count();
    await expect(
      endLease(db, aino, contract.id, {
        requestId: randomUUID(),
        choice: 'return',
        condition: 'good',
        usageValue: 0,
      })
    ).rejects.toMatchObject({ code: 'END_NOT_ALLOWED', details: { reason: 'too_early' } });
    expect((await getContract(db, aino, contract.id)).status).toBe('active');
    expect(await db.auditLog.count()).toBe(auditsBefore);
    expect(await db.invoice.count()).toBe(0);
  });

  it('requires actual completion evidence and the explicit operator mode', async () => {
    const { contract, endContext } = await returned();
    const input = await relistInput();
    await expect(relistAsset(db, endContext, contract.assetId, input)).rejects.toMatchObject({
      code: 'OPERATOR_MODE_REQUIRED',
    });
    const operator = { ...endContext, operator: true };
    await expect(
      relistAsset(db, operator, contract.assetId, {
        ...input,
        completedTaskIds: ['safety_inspection'],
      })
    ).rejects.toMatchObject({ code: 'READINESS_INCOMPLETE' });
    expect((await db.asset.findUniqueOrThrow({ where: { id: contract.assetId } })).status).toBe(
      'returned'
    );
    expect(await db.auditLog.count({ where: { action: 'asset.relisted' } })).toBe(0);
  });

  it('rolls back relisting and its new price when the audit insert fails', async () => {
    const { contract, endContext } = await returned();
    await expect(
      relistAsset(
        db,
        { ...endContext, operator: true, actor: undefined as unknown as string },
        contract.assetId,
        await relistInput()
      )
    ).rejects.toThrow();
    const asset = await db.asset.findUniqueOrThrow({ where: { id: contract.assetId } });
    const release = await db.assetRelease.findUniqueOrThrow({
      where: { asset_id: contract.assetId },
    });
    expect(asset.status).toBe('returned');
    expect(asset.condition).toBe('fair');
    expect(release.net_price_cents).toBeNull();
    expect(release.ready_on).toBeNull();
  });

  it('deduplicates two overlapping invoice requests and keeps one audit event', async () => {
    const contract = await createLease(db, aino);
    await Promise.all([issueInvoices(db, aino, contract.id), issueInvoices(db, aino, contract.id)]);
    expect(await db.invoice.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: 'invoices.issued' } })).toBe(1);
  });

  it('shows imported history as unknown and scopes customer audit rows', async () => {
    expect((await getPassport(db, 'ebike-008')).earlierLivesWithoutRecords).toBe(2);
    await createLease(db, aino);
    const lena = await demoContext('cust-lena');
    expect(await getScopedAudit(db, lena)).toEqual([]);
    expect(await getScopedAudit(db, { ...lena, operator: true })).toHaveLength(3);
    expect(await getScopedAudit(db, aino)).toHaveLength(3);
  });
});
