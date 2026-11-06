import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import { signContract } from './contracts';
import { getLeaseForecast } from './lease-forecast';
import { loadPricingData, type PricingData } from './pricing-data';
import type { PrismaClient } from './prisma-client';
import { createQuote } from './quotes';
import { createReturnRequest } from './returns';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let pricing: PricingData;

const today = '2026-11-05';

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

/** Signs a lease so that it ends on `endDate`, by moving its stored end date afterwards. */
async function leaseEndingOn(assetId: string, endDate: string, customerId = 'cust-aino') {
  const quote = await createQuote(db, pricing, {
    assetId,
    termMonths: 36,
    onDate: '2026-11-05',
    downPaymentCents: 0,
    actor: 'test',
  });
  const contract = await signContract(db, pricing, {
    quoteId: quote.id,
    customerId,
    signedOn: '2026-11-05',
    startDate: '2026-11-05',
    accepted: quote,
    actor: 'test',
  });
  await db.contract.update({ where: { id: contract.id }, data: { end_date: endDate } });
  return contract;
}

describe('getLeaseForecast', () => {
  it('defaults to next calendar month', async () => {
    const result = await getLeaseForecast(db, { today });

    expect(result.range).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(result.preset).toBe('next_month');
    expect(result.entries).toEqual([]);
    expect(result.summary.total).toBe(0);
  });

  it('lists active leases ending in the range with asset and customer, soonest first', async () => {
    await leaseEndingOn('ebike-004', '2026-12-20', 'cust-lena');
    await leaseEndingOn('ebike-003', '2026-12-02');

    const result = await getLeaseForecast(db, { today });

    expect(result.entries.map((e) => [e.assetId, e.endDate, e.customerName])).toEqual([
      ['ebike-003', '2026-12-02', 'Aino Virtanen'],
      ['ebike-004', '2026-12-20', 'Lena Tamm'],
    ]);
    expect(result.entries[0]).toMatchObject({
      daysUntilEnd: 27,
      phase: 'upcoming',
      openReturn: null,
      asset: { id: 'ebike-003', category: 'e_bike', make: 'Nordvolt', model: 'Trail 500' },
    });
    expect(result.summary).toMatchObject({ total: 2, noReturnYet: 2, returnRequested: 0 });
  });

  it('includes leases ending on the first and last day, and leaves out the days around them', async () => {
    await leaseEndingOn('ebike-001', '2026-11-30');
    await leaseEndingOn('ebike-002', '2026-12-01');
    await leaseEndingOn('ebike-003', '2026-12-31');
    await leaseEndingOn('ebike-004', '2027-01-01');

    const result = await getLeaseForecast(db, { today });

    expect(result.entries.map((e) => e.assetId)).toEqual(['ebike-002', 'ebike-003']);
  });

  it('only counts active leases: an ended lease has already come back', async () => {
    const contract = await leaseEndingOn('ebike-003', '2026-12-02');
    await db.contract.update({ where: { id: contract.id }, data: { status: 'ended' } });

    expect((await getLeaseForecast(db, { today })).entries).toEqual([]);
  });

  it('shows a return the customer already requested, and not a finished one', async () => {
    const asked = await leaseEndingOn('ebike-003', '2026-12-02');
    const request = await createReturnRequest(db, {
      contractId: asked.id,
      customerId: 'cust-aino',
      actor: 'cust-aino',
    });
    const done = await leaseEndingOn('ebike-004', '2026-12-03', 'cust-lena');
    const finished = await createReturnRequest(db, {
      contractId: done.id,
      customerId: 'cust-lena',
      actor: 'cust-lena',
    });
    await db.returnRequest.update({ where: { id: finished.id }, data: { status: 'cancelled' } });

    const result = await getLeaseForecast(db, { today });

    expect(result.entries.map((e) => e.openReturn)).toEqual([
      { id: request.id, status: 'requested' },
      null,
    ]);
    expect(result.summary).toMatchObject({ returnRequested: 1, noReturnYet: 1 });
  });

  it('uses a custom range and flags a lease that is already past its end', async () => {
    await leaseEndingOn('ebike-003', '2026-10-30');
    await leaseEndingOn('ebike-004', '2026-11-08', 'cust-lena');

    const result = await getLeaseForecast(db, { today, from: '2026-10-01', to: '2026-11-30' });

    expect(result.preset).toBeNull();
    expect(result.entries.map((e) => [e.assetId, e.phase])).toEqual([
      ['ebike-003', 'overdue'],
      ['ebike-004', 'soon'],
    ]);
    expect(result.summary).toMatchObject({ overdue: 1, endingSoon: 1 });
  });

  it('falls back to a null name for a customer that is not in the data pack', async () => {
    await leaseEndingOn('ebike-003', '2026-12-02', 'cust-unknown');

    const result = await getLeaseForecast(db, { today, customers: [] });

    expect(result.entries[0]?.customerName).toBeNull();
  });

  it.each([
    [{ from: '2026-12-01' }, 'INVALID_RANGE_INCOMPLETE_RANGE'],
    [{ from: 'x', to: 'y' }, 'INVALID_RANGE_INVALID_DATE'],
    [{ from: '2026-12-20', to: '2026-12-01' }, 'INVALID_RANGE_FROM_AFTER_TO'],
    [{ from: '2020-01-01', to: '2026-12-01' }, 'INVALID_RANGE_RANGE_TOO_LONG'],
  ])('refuses the range %j with a 400 %s', async (range, code) => {
    await expect(getLeaseForecast(db, { today, ...range })).rejects.toMatchObject({
      status: 400,
      code,
    });
  });
});
