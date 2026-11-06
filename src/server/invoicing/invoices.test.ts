import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import type { Asset } from '@/data/schemas';
import { createTestDb } from '../../../tests/helpers/test-db';
import { seedAssets } from '../assets/assets';
import { createApplication, type ApplicationSubmissionRequest } from '../applications/applications';
import { createContract } from '../contracts/contracts';
import { generateInvoices, listInvoices } from './invoices';
import { seedCustomers } from '../assets/customers';
import type { PrismaClient } from '../prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let dataPack: Asset[];
let customerData: Awaited<ReturnType<typeof loadCustomers>>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  dataPack = await loadAssets();
  customerData = await loadCustomers();
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await db.invoice.deleteMany();
  await db.assetHistory.deleteMany();
  await db.auditLog.deleteMany();
  await db.contract.deleteMany();
  await db.application.deleteMany();
  await db.customer.deleteMany();
  await db.asset.deleteMany();
  await seedCustomers(db, customerData);
  await seedAssets(db, dataPack);
});

const approvedAnswers = {
  q_customer_type: 'consumer',
  q_full_name: 'Aino Virtanen',
  q_birth_date: '1997-04-12',
  q_email: 'aino@example.com',
  q_country: 'FI',
  q_employment: 'employed',
  q_monthly_income: 320_000,
  q_usage_purpose: 'commuting',
};

async function createActiveContract(date = '2026-11-05') {
  const submission: ApplicationSubmissionRequest = {
    customerId: 'cust-aino',
    assetId: 'ebike-003',
    date,
    downPaymentCents: 0,
    termMonths: 36,
    actor: 'team-test',
    answers: approvedAnswers,
  };
  const application = await createApplication(db, submission);
  if (!application.ok) throw new Error(`expected approved application, got ${application.reason}`);

  const contract = await createContract(db, {
    applicationId: application.application.id,
    signedOn: date,
    actor: 'team-test',
  });
  if (!contract.ok) throw new Error(`expected active contract, got ${contract.reason}`);
  return contract.contract;
}

describe('generateInvoices', () => {
  it('persists the complete locked-rent schedule and audit entry', async () => {
    const contract = await createActiveContract();

    const result = await generateInvoices(db, { contractId: contract.id, actor: 'team-test' });

    expect(result).toMatchObject({ ok: true, created: true });
    if (!result.ok) return;
    expect(result.invoices).toHaveLength(36);
    expect(result.invoices.slice(0, 3)).toMatchObject([
      {
        sequence: 1,
        periodStart: '2026-11-05',
        periodEnd: '2026-12-04',
        dueOn: '2026-11-05',
        netRentCents: 10_730,
        vatRateBasisPoints: 2_550,
        vatCents: 2_736,
        totalCents: 13_466,
      },
      {
        sequence: 2,
        periodStart: '2026-12-05',
        periodEnd: '2027-01-04',
        dueOn: '2026-12-05',
      },
      {
        sequence: 3,
        periodStart: '2027-01-05',
        periodEnd: '2027-02-04',
        dueOn: '2027-01-05',
        vatRateBasisPoints: 2_600,
        vatCents: 2_790,
        totalCents: 13_520,
      },
    ]);
    expect(result.invoices.reduce((sum, invoice) => sum + invoice.netRentCents, 0)).toBe(
      contract.monthlyNetRentCents * contract.termMonths
    );
    expect(
      result.invoices.reduce((sum, invoice) => sum + invoice.netRentCents, 0) +
        contract.downPaymentCents +
        contract.buyoutCents
    ).toBe(contract.pricingSnapshot.pricing.totalCostWithBuyoutCents);

    expect(await db.invoice.count()).toBe(36);
    expect(await db.auditLog.count({ where: { action: 'invoices.generated' } })).toBe(1);
  });

  it('keeps a January 31 contract on the last day of every month', async () => {
    const contract = await createActiveContract('2026-01-31');
    const result = await generateInvoices(db, { contractId: contract.id, actor: 'team-test' });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.invoices.slice(0, 5).map((invoice) => invoice.dueOn)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
  });

  it('is idempotent and returns an existing complete schedule', async () => {
    const contract = await createActiveContract();
    const input = { contractId: contract.id, actor: 'team-test' };

    const first = await generateInvoices(db, input);
    const second = await generateInvoices(db, input);

    expect(first).toMatchObject({ ok: true, created: true });
    expect(second).toMatchObject({ ok: true, created: false });
    if (!first.ok || !second.ok) return;
    expect(second.invoices.map((invoice) => invoice.id)).toEqual(
      first.invoices.map((invoice) => invoice.id)
    );
    expect(await db.invoice.count()).toBe(36);
    expect(await db.auditLog.count({ where: { action: 'invoices.generated' } })).toBe(1);
  });

  it('lists a generated schedule without writing', async () => {
    const contract = await createActiveContract();
    expect(await listInvoices(db, contract.id)).toEqual({
      ok: false,
      reason: 'invoice_schedule_not_generated',
    });

    await generateInvoices(db, { contractId: contract.id, actor: 'team-test' });
    const result = await listInvoices(db, contract.id);
    expect(result).toMatchObject({ ok: true, invoices: expect.any(Array) });
    expect(await db.auditLog.count({ where: { action: 'invoices.generated' } })).toBe(1);
  });

  it('rejects missing and inactive contracts without writes', async () => {
    await expect(
      generateInvoices(db, { contractId: 'missing', actor: 'team-test' })
    ).resolves.toEqual({ ok: false, reason: 'contract_not_found' });

    const contract = await createActiveContract();
    await db.contract.update({ where: { id: contract.id }, data: { status: 'completed' } });
    await expect(
      generateInvoices(db, { contractId: contract.id, actor: 'team-test' })
    ).resolves.toEqual({ ok: false, reason: 'contract_not_active', status: 'completed' });
    expect(await db.invoice.count()).toBe(0);
    expect(await db.auditLog.count({ where: { action: 'invoices.generated' } })).toBe(0);
  });
});
