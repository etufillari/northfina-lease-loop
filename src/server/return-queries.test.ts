import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadAssets, loadCustomers } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { ApiError } from './api-response';
import { seedAssets } from './assets';
import { signContract } from './contracts';
import { loadPricingData, type PricingData } from './pricing-data';
import type { PrismaClient } from './prisma-client';
import { createQuote } from './quotes';
import { getReturnRequest, listReturnRequests } from './return-queries';
import { createReturnRequest, inspectReturn, markReturnReceived, planReturn } from './returns';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let pricing: PricingData;

const actor = 'test-dealer';
const customerId = 'cust-aino';

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  pricing = await loadPricingData();
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

async function requestReturn(assetId: string, expectedReturnDate?: string, owner = customerId) {
  const quote = await createQuote(db, pricing, {
    assetId,
    termMonths: 36,
    onDate: '2026-11-05',
    downPaymentCents: 0,
    actor: 'test',
  });
  const contract = await signContract(db, pricing, {
    quoteId: quote.id,
    customerId: owner,
    signedOn: '2026-11-05',
    startDate: '2026-11-05',
    accepted: quote,
    actor: 'test',
  });
  return createReturnRequest(db, {
    contractId: contract.id,
    customerId: owner,
    expectedReturnDate,
    actor: owner,
  });
}

describe('listReturnRequests', () => {
  it('returns an empty list when nothing was requested', async () => {
    expect(await listReturnRequests(db)).toEqual([]);
  });

  it('joins the customer, asset and contract and names the next action', async () => {
    const created = await requestReturn('ebike-003', '2026-11-10');

    const [item] = await listReturnRequests(db);

    expect(item).toMatchObject({
      id: created.id,
      status: 'requested',
      nextAction: 'receive',
      expectedReturnDate: '2026-11-10',
      customer: { id: customerId, name: 'Aino Virtanen' },
      contract: { id: created.contract_id },
      asset: { id: 'ebike-003', category: 'e_bike', make: 'Nordvolt', model: 'Trail 500' },
    });
    expect(item?.contract.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('falls back to a null name for a customer that is not in the data pack', async () => {
    await requestReturn('ebike-003', '2026-11-10', 'cust-unknown');

    const [item] = await listReturnRequests(db, { customers: [] });

    expect(item?.customer).toEqual({ id: 'cust-unknown', name: null });
  });

  it('puts the soonest expected date first and undated requests last', async () => {
    const late = await requestReturn('ebike-003', '2026-12-01');
    const undated = await requestReturn('ebike-004');
    const soon = await requestReturn('ebike-005', '2026-11-08');

    const ids = (await listReturnRequests(db)).map((item) => item.id);

    expect(ids).toEqual([soon.id, late.id, undated.id]);
  });

  it('lists finished requests after open ones', async () => {
    const cancelled = await requestReturn('ebike-003', '2026-11-01');
    const open = await requestReturn('ebike-004', '2026-12-01');
    await db.returnRequest.update({ where: { id: cancelled.id }, data: { status: 'cancelled' } });

    const ids = (await listReturnRequests(db)).map((item) => item.id);

    expect(ids).toEqual([open.id, cancelled.id]);
  });

  it('filters by status', async () => {
    const first = await requestReturn('ebike-003', '2026-11-10');
    await requestReturn('ebike-004', '2026-11-11');
    await markReturnReceived(db, first.id, { actor });

    const received = await listReturnRequests(db, { status: 'received' });

    expect(received.map((item) => item.id)).toEqual([first.id]);
    expect(received[0]?.nextAction).toBe('inspect');
  });

  it('rejects a status that does not exist', async () => {
    await expect(listReturnRequests(db, { status: 'lost' })).rejects.toMatchObject({
      code: 'INVALID_STATUS',
    });
  });
});

describe('getReturnRequest', () => {
  it('shows nothing recorded yet for a new request', async () => {
    const created = await requestReturn('ebike-003', '2026-11-10');

    const detail = await getReturnRequest(db, created.id);

    expect(detail).toMatchObject({
      status: 'requested',
      received: null,
      inspection: null,
      plan: null,
    });
  });

  it('follows the request through receipt, inspection and plan', async () => {
    const created = await requestReturn('ebike-003', '2026-11-10');

    await markReturnReceived(db, created.id, { actor });
    expect((await getReturnRequest(db, created.id)).received).toMatchObject({ by: actor });

    await inspectReturn(db, created.id, { condition: 'fair', usageValue: 18_400, actor });
    expect((await getReturnRequest(db, created.id)).inspection).toMatchObject({
      by: actor,
      condition: 'fair',
      usageUnit: 'km',
      usageValue: 18_400,
      usageSinceLastService: null,
    });

    await planReturn(db, created.id, { targetCondition: 'good', actor });
    const detail = await getReturnRequest(db, created.id);

    expect(detail.status).toBe('planned');
    expect(detail.nextAction).toBe('ready_for_next_step');
    expect(detail.plan).toMatchObject({
      targetCondition: 'good',
      inspectedCondition: 'fair',
      resultingCondition: 'good',
      usageReset: true,
      resultingUsage: 0,
    });
    expect(detail.plan?.totalCostCents).toBe(
      detail.plan?.actions.reduce((sum, action) => sum + action.costCents, 0)
    );
  });

  it('reports an unknown request as not found', async () => {
    const error = await getReturnRequest(db, 'missing').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: 'RETURN_REQUEST_NOT_FOUND' });
  });

  it('uses the supplied customers instead of the data pack', async () => {
    const created = await requestReturn('ebike-003', '2026-11-10');
    const customers = (await loadCustomers()).map((customer) => ({
      ...customer,
      name: customer.id === customerId ? 'Renamed' : customer.name,
    }));

    const detail = await getReturnRequest(db, created.id, { customers });

    expect(detail.customer.name).toBe('Renamed');
  });
});
