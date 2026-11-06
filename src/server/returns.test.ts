import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { ApiError } from './api-response';
import { seedAssets } from './assets';
import { signContract } from './contracts';
import { loadPricingData, type PricingData } from './pricing-data';
import type { PrismaClient } from './prisma-client';
import { createQuote } from './quotes';
import { createReturnRequest } from './returns';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let data: PricingData;

const actor = 'test';
const customerId = 'cust-aino';

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  data = await loadPricingData();
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await db.returnRequest.deleteMany();
  await db.auditLog.deleteMany();
  await db.invoice.deleteMany();
  await db.contract.deleteMany();
  await db.quote.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

const code = (promise: Promise<unknown>) =>
  promise.then(
    () => 'no error',
    (error: unknown) => (error instanceof ApiError ? error.code : 'unexpected error')
  );

async function createActiveContract(assetId = 'ebike-003') {
  const quote = await createQuote(db, data, {
    assetId,
    termMonths: 36,
    onDate: '2026-11-05',
    downPaymentCents: 0,
    actor,
  });

  return signContract(db, data, {
    quoteId: quote.id,
    customerId,
    signedOn: '2026-11-05',
    startDate: '2026-11-05',
    accepted: quote,
    actor,
  });
}

describe('createReturnRequest', () => {
  it('creates a return request without changing asset status and writes an audit row', async () => {
    const contract = await createActiveContract();

    const result = await createReturnRequest(db, {
      contractId: contract.id,
      customerId,
      expectedReturnDate: '2026-11-10',
      actor,
    });

    expect(result).toMatchObject({
      asset_id: contract.assetId,
      contract_id: contract.id,
      customer_id: customerId,
      status: 'requested',
      expected_return_date: '2026-11-10',
    });

    const asset = await db.asset.findUniqueOrThrow({
      where: { id: contract.assetId },
    });

    expect(asset.status).toBe('reserved');

    expect(
      await db.auditLog.findFirst({
        where: {
          action: 'return.requested',
          entity_id: result.id,
        },
      })
    ).toMatchObject({
      actor,
      action: 'return.requested',
      entity_type: 'return_request',
      entity_id: result.id,
    });
  });

  it('rejects a contract that does not exist', async () => {
    expect(
      await code(
        createReturnRequest(db, {
          contractId: 'missing-contract',
          customerId,
          actor,
        })
      )
    ).toBe('CONTRACT_NOT_FOUND');
  });

  it('rejects a customer who does not own the contract', async () => {
    const contract = await createActiveContract();

    expect(
      await code(
        createReturnRequest(db, {
          contractId: contract.id,
          customerId: 'another-customer',
          actor,
        })
      )
    ).toBe('CUSTOMER_CONTRACT_MISMATCH');

    expect(await db.returnRequest.count()).toBe(0);
  });

  it('rejects a contract that is not active', async () => {
    const contract = await createActiveContract();

    await db.contract.update({
      where: { id: contract.id },
      data: { status: 'ended' },
    });

    expect(
      await code(
        createReturnRequest(db, {
          contractId: contract.id,
          customerId,
          actor,
        })
      )
    ).toBe('CONTRACT_NOT_ACTIVE');

    expect(await db.returnRequest.count()).toBe(0);
  });

  it('rejects an asset that is not reserved', async () => {
    const contract = await createActiveContract();

    await db.asset.update({
      where: { id: contract.assetId },
      data: { status: 'available' },
    });

    expect(
      await code(
        createReturnRequest(db, {
          contractId: contract.id,
          customerId,
          actor,
        })
      )
    ).toBe('ASSET_NOT_ON_ACTIVE_LEASE');

    expect(await db.returnRequest.count()).toBe(0);
  });

  it('prevents a second open return request for the same contract', async () => {
    const contract = await createActiveContract();

    const input = {
      contractId: contract.id,
      customerId,
      actor,
    };

    await createReturnRequest(db, input);

    expect(await code(createReturnRequest(db, input))).toBe('RETURN_REQUEST_ALREADY_OPEN');

    expect(await db.returnRequest.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: 'return.requested' } })).toBe(1);
  });

  it('allows a new request when the previous request was cancelled', async () => {
    const contract = await createActiveContract();

    const input = {
      contractId: contract.id,
      customerId,
      actor,
    };

    const first = await createReturnRequest(db, input);

    await db.returnRequest.update({
      where: { id: first.id },
      data: { status: 'cancelled' },
    });

    const second = await createReturnRequest(db, input);

    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe('requested');
    expect(await db.returnRequest.count()).toBe(2);
  });

  it('does not create a return request or audit entry when validation fails', async () => {
    const contract = await createActiveContract();

    await expect(
      createReturnRequest(db, {
        contractId: contract.id,
        customerId: 'wrong-customer',
        actor,
      })
    ).rejects.toMatchObject({
      code: 'CUSTOMER_CONTRACT_MISMATCH',
    });

    expect(await db.returnRequest.count()).toBe(0);
    expect(await db.auditLog.count({ where: { action: 'return.requested' } })).toBe(0);
  });
});
