import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { ApiError } from './api-response';
import { seedAssets } from './assets';
import { signContract } from './contracts';
import { loadPricingData, type PricingData } from './pricing-data';
import type { PrismaClient } from './prisma-client';
import { createQuote } from './quotes';
import { createBuyoutRequest } from './buyouts';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let pricing: PricingData;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  pricing = await loadPricingData();
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await db.buyoutRequest.deleteMany();
  await db.auditLog.deleteMany();
  await db.invoice.deleteMany();
  await db.contract.deleteMany();
  await db.quote.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

async function createActiveContract() {
  const quote = await createQuote(db, pricing, {
    assetId: 'ebike-003',
    termMonths: 36,
    onDate: '2026-11-05',
    downPaymentCents: 0,
    actor: 'test',
  });
  return signContract(db, pricing, {
    quoteId: quote.id,
    customerId: 'cust-aino',
    signedOn: '2026-11-05',
    startDate: '2026-11-05',
    accepted: quote,
    actor: 'test',
  });
}

function errorCode(promise: Promise<unknown>) {
  return promise.then(
    () => 'NO_ERROR',
    (error: unknown) => (error instanceof ApiError ? error.code : 'UNEXPECTED_ERROR')
  );
}

describe('createBuyoutRequest', () => {
  it('allows a buyout request before the lease ends', async () => {
    const contract = await createActiveContract();

    const result = await createBuyoutRequest(db, {
      contractId: contract.id,
      customerId: contract.customerId,
      actor: contract.customerId,
    });

    expect(result).toMatchObject({
      status: 'requested',
      settlement_due_after: contract.endDate,
    });
  });

  it('creates an audited request with the locked contract amount at term end', async () => {
    const contract = await createActiveContract();
    const result = await createBuyoutRequest(db, {
      contractId: contract.id,
      customerId: contract.customerId,
      actor: contract.customerId,
    });

    expect(result).toMatchObject({
      contract_id: contract.id,
      customer_id: contract.customerId,
      buyout_net_cents: contract.buyoutNetCents,
      settlement_due_after: contract.endDate,
      status: 'requested',
    });
    expect(await db.auditLog.findFirst({ where: { entity_id: result.id } })).toMatchObject({
      action: 'buyout.requested',
      entity_type: 'buyout_request',
    });
  });

  it('rejects a second open request', async () => {
    const contract = await createActiveContract();
    const input = {
      contractId: contract.id,
      customerId: contract.customerId,
      actor: contract.customerId,
    };
    await createBuyoutRequest(db, input);

    expect(await errorCode(createBuyoutRequest(db, input))).toBe('BUYOUT_REQUEST_ALREADY_OPEN');
  });
});
