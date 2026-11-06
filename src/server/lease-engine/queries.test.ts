import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import { createTestDb } from '../../../tests/helpers/test-db';
import { activateLease, completeLease } from './leases';
import { issueInvoice } from './invoices';
import { getInvoice, getLeaseByContract, getLeaseSchedule } from './queries';

let database: Awaited<ReturnType<typeof createTestDb>>;
let leaseId: string;
const terms = {
  contractId: 'contract-query',
  assetId: 'laptop-001',
  customerId: 'cust-test',
  startDate: '2026-01-31',
  termMonths: 36 as const,
  monthlyNetCents: 10730,
  paymentDueDays: 14,
};
beforeAll(async () => {
  database = await createTestDb();
  const lease = await activateLease(
    database.db,
    { actor: 'test', idempotencyKey: 'query-activate' },
    terms,
    terms.startDate
  );
  leaseId = lease.leaseId;
});
afterAll(async () => {
  await database.cleanup();
});

describe('engine read handoffs', () => {
  it('resolves the current lease by signed contract and reports completion', async () => {
    expect(await getLeaseByContract(database.db, terms.contractId)).toMatchObject({
      leaseId,
      ...terms,
      status: 'ACTIVE',
    });
    await completeLease(
      database.db,
      { actor: 'test', idempotencyKey: 'query-complete' },
      leaseId,
      '2029-01-31',
      1
    );
    expect(await getLeaseByContract(database.db, terms.contractId)).toMatchObject({
      leaseId,
      status: 'COMPLETED',
      version: 2,
    });
  });
  it('projects exact signed totals and Jan31 anniversaries without issuing invoices', async () => {
    const schedule = await getLeaseSchedule(database.db, leaseId);
    expect(schedule.totalNetCents).toBe(386280);
    expect(schedule.periods).toHaveLength(36);
    expect(schedule.periods[1]).toMatchObject({ issueDate: '2026-02-28', dueDate: '2026-03-14' });
    expect(schedule.periods[2]?.issueDate).toBe('2026-03-31');
    expect(schedule.periods[25]?.issueDate).toBe('2028-02-29');
    expect(await database.db.engineInvoice.count()).toBe(0);
  });
  it('reads the original issued invoice without a current tax provider', async () => {
    const invoice = await issueInvoice(
      database.db,
      { actor: 'test', idempotencyKey: 'query-issue' },
      { leaseId, periodIndex: 1 },
      (await loadVatRates()).rates
    );
    expect(await getInvoice(database.db, invoice.invoiceId)).toEqual(invoice);
  });
  it('returns NOT_FOUND for unknown contract, invoice or lease', async () => {
    await expect(getLeaseByContract(database.db, 'missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(getInvoice(database.db, 'missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(getLeaseSchedule(database.db, 'missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
