import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import { loadAssets, loadVatRates } from '@/data/load';
import * as audit from '@/server/audit';
import { createTestDb } from '../../../tests/helpers/test-db';
import {
  ainoSignedTerms,
  mockContractActivation,
} from '../../../tests/fixtures/mock-contract-activation';
import { activateFromSignedContract } from './contract-activation';
import { getLease } from './leases';
import { issueInvoice } from './invoices';

let db: PrismaClient;
let cleanup: () => Promise<void>;
const context = { actor: 'operator-test', idempotencyKey: 'mock-contract-activation' };
const input = { contractId: ainoSignedTerms.contractId, activatedOn: ainoSignedTerms.startDate };

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  await db.engineInvoice.deleteMany();
  await db.engineLease.deleteMany();
  await db.engineCommandReceipt.deleteMany();
  await db.engineInvoiceCounter.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  const asset = (await loadAssets()).find((a) => a.id === ainoSignedTerms.assetId);
  if (!asset) throw new Error('Missing asset fixture');
  const { usage, ...fields } = asset;
  await db.asset.create({
    data: { ...fields, status: 'available', usage_unit: usage.unit, usage_value: usage.value },
  });
});
const assetStatus = async () =>
  (await db.asset.findUniqueOrThrow({ where: { id: ainoSignedTerms.assetId } })).status;

describe('mock signed-contract boundary with real engine persistence', () => {
  it('loads signed terms from the provider and saves an active lease and first invoice', async () => {
    const provider = mockContractActivation();
    const lease = await activateFromSignedContract(db, context, input, provider);
    expect(await getLease(db, lease.leaseId)).toMatchObject({
      ...ainoSignedTerms,
      status: 'ACTIVE',
    });
    expect(provider.recordActivation).toHaveBeenCalledWith(
      expect.anything(),
      input.contractId,
      lease.leaseId
    );
    expect(await assetStatus()).toBe('reserved');
    const rates = (await loadVatRates()).rates;
    const invoiceInput = { leaseId: lease.leaseId, periodIndex: 1 };
    const invoiceContext = { actor: context.actor, idempotencyKey: 'mock-first-invoice' };
    const invoice = await issueInvoice(db, invoiceContext, invoiceInput, rates);
    expect(invoice).toMatchObject({
      netCents: 10730,
      vatCents: 2736,
      grossCents: 13466,
      number: 'LL-2026-000001',
    });
    expect(await issueInvoice(db, invoiceContext, invoiceInput, rates)).toEqual(invoice);
    expect(await db.engineInvoice.count()).toBe(1);
  });

  it('replays activation without calling the provider again or reserving twice', async () => {
    const provider = mockContractActivation();
    const first = await activateFromSignedContract(db, context, input, provider);
    expect(await activateFromSignedContract(db, context, input, provider)).toEqual(first);
    expect(provider.prepareActivation).toHaveBeenCalledTimes(1);
    expect(provider.recordActivation).toHaveBeenCalledTimes(1);
    expect(await db.engineLease.count()).toBe(1);
    await expect(
      activateFromSignedContract(db, context, { ...input, activatedOn: '2026-11-06' }, provider)
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('rolls back reservation, lease and receipt when the contract adapter fails after creation', async () => {
    await expect(
      activateFromSignedContract(
        db,
        context,
        input,
        mockContractActivation({ failAfterLease: true })
      )
    ).rejects.toThrow('mock contract update failed');
    expect(await assetStatus()).toBe('available');
    expect(await db.engineLease.count()).toBe(0);
    expect(await db.engineCommandReceipt.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
    expect(
      (await activateFromSignedContract(db, context, input, mockContractActivation())).status
    ).toBe('ACTIVE');
  });

  it('rolls back all changes if audit writing fails', async () => {
    const original = audit.withAudit;
    vi.spyOn(audit, 'withAudit').mockImplementation((client, entry, work) =>
      original(client, { ...entry, actor: undefined as unknown as string }, work)
    );
    await expect(
      activateFromSignedContract(db, context, input, mockContractActivation())
    ).rejects.toThrow();
    expect(await assetStatus()).toBe('available');
    expect(await db.engineLease.count()).toBe(0);
    expect(await db.engineCommandReceipt.count()).toBe(0);
  });

  it('honors provider rejection and refuses mismatched signed references', async () => {
    await expect(
      activateFromSignedContract(db, context, input, mockContractActivation({ approved: false }))
    ).rejects.toMatchObject({ reason: 'mock_contract_not_approved' });
    await expect(
      activateFromSignedContract(
        db,
        context,
        { ...input, contractId: 'unknown' },
        mockContractActivation()
      )
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const mismatched = mockContractActivation();
    mismatched.prepareActivation.mockResolvedValue({
      ...ainoSignedTerms,
      contractId: 'wrong-contract',
    });
    await expect(activateFromSignedContract(db, context, input, mismatched)).rejects.toMatchObject({
      reason: 'contract_reference_mismatch',
    });
    expect(await db.engineLease.count()).toBe(0);
    expect(await assetStatus()).toBe('available');
  });

  it('does not create another lease when a fresh request finds the mock asset unavailable', async () => {
    await activateFromSignedContract(db, context, input, mockContractActivation());
    await expect(
      activateFromSignedContract(
        db,
        { ...context, idempotencyKey: 'another-request' },
        input,
        mockContractActivation()
      )
    ).rejects.toMatchObject({ reason: 'mock_asset_unavailable' });
    expect(await db.engineLease.count()).toBe(1);
    expect(await db.engineCommandReceipt.count()).toBe(1);
  });

  it('rolls back the mock reservation when the engine rejects activation date', async () => {
    await expect(
      activateFromSignedContract(
        db,
        context,
        { ...input, activatedOn: '2026-11-06' },
        mockContractActivation()
      )
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    expect(await assetStatus()).toBe('available');
    expect(await db.engineLease.count()).toBe(0);
  });
});
