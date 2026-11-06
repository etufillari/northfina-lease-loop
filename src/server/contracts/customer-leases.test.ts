import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { loadAssets, loadCustomers } from '@/data/load';
import { createTestDb } from '../../../tests/helpers/test-db';
import { createApplication } from '../applications/applications';
import { seedAssets } from '../assets/assets';
import { seedCustomers } from '../assets/customers';
import { generateInvoices } from '../invoicing/invoices';
import { completeContract } from '../lifecycle/end-of-term';
import type { PrismaClient } from '../prisma-client';
import { createContract } from './contracts';
import { listCustomerLeases } from './customer-leases';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  await seedCustomers(db, await loadCustomers());
  await seedAssets(db, await loadAssets());
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await db.payment.deleteMany();
  await db.invoice.deleteMany();
  await db.assetHistory.deleteMany();
  await db.auditLog.deleteMany();
  await db.contract.deleteMany();
  await db.application.deleteMany();
  await db.asset.updateMany({ where: { id: 'ebike-003' }, data: { status: 'available' } });
  await db.asset.updateMany({ where: { id: 'ebike-001' }, data: { status: 'available' } });
});

async function lease(assetId: string, termMonths: number) {
  const application = await createApplication(db, {
    customerId: 'cust-aino',
    assetId,
    date: '2026-11-05',
    downPaymentCents: 0,
    termMonths,
    actor: 'team-test',
    answers: {
      q_customer_type: 'consumer',
      q_full_name: 'Aino Virtanen',
      q_birth_date: '1997-04-12',
      q_email: 'aino@example.com',
      q_country: 'FI',
      q_employment: 'employed',
      q_monthly_income: 320_000,
      q_usage_purpose: 'commuting',
    },
  });
  if (!application.ok) throw new Error(`expected application, got ${application.reason}`);
  const contract = await createContract(db, {
    applicationId: application.application.id,
    signedOn: '2026-11-05',
    actor: 'team-test',
  });
  if (!contract.ok) throw new Error(`expected contract, got ${contract.reason}`);
  return contract.contract.id;
}

async function settleRent(contractId: string, asOf: string) {
  const schedule = await generateInvoices(db, { contractId, actor: 'team-test' }, asOf);
  if (!schedule.ok) throw new Error(`expected invoices, got ${schedule.reason}`);
  for (const invoice of schedule.invoices) {
    await db.payment.create({
      data: {
        id: randomUUID(),
        invoice_id: invoice.id,
        amount_cents: invoice.totalCents,
        paid_on: invoice.dueOn,
      },
    });
  }
}

describe('listCustomerLeases', () => {
  it('returns only that customer, with leases waiting for a decision first', async () => {
    const longer = await lease('ebike-003', 36);
    const shorter = await lease('ebike-001', 12);
    await settleRent(longer, '2029-11-05');

    const leases = await listCustomerLeases(db, 'cust-aino', '2029-11-05');

    expect(leases.map((entry) => entry.id)).toEqual([longer, shorter]);
    expect(leases[0]).toMatchObject({
      status: 'active',
      endOfTerm: { status: 'ready' },
      asset: { model: expect.any(String) },
    });
    expect(await listCustomerLeases(db, 'cust-mikko', '2029-11-05')).toEqual([]);
  });

  it('says a running lease has not finished, even before invoices exist', async () => {
    await lease('ebike-003', 36);

    const [entry] = await listCustomerLeases(db, 'cust-aino', '2027-01-01');

    expect(entry?.endOfTerm).toMatchObject({ status: 'blocked', reason: 'term_not_finished' });
  });

  it('shows the choice made on a finished lease', async () => {
    const id = await lease('ebike-003', 36);
    await settleRent(id, '2029-11-05');
    await completeContract(db, id, {
      action: 'returned',
      completedOn: '2029-11-05',
      actor: 'team-test',
    });

    const [entry] = await listCustomerLeases(db, 'cust-aino', '2029-11-06');

    expect(entry).toMatchObject({ status: 'completed', endOfTermAction: 'returned' });
  });
});
