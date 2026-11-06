import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import type { Asset } from '@/data/schemas';
import { createTestDb } from '../../../tests/helpers/test-db';
import { seedAssets } from '../assets/assets';
import { createApplication, type ApplicationSubmissionRequest } from '../applications/applications';
import { createContract } from '../contracts/contracts';
import { generateInvoices } from '../invoicing/invoices';
import { completeContract, type EndOfTermRequest } from './end-of-term';
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
  await db.payment.deleteMany();
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

async function createActiveContract() {
  const submission: ApplicationSubmissionRequest = {
    customerId: 'cust-aino',
    assetId: 'ebike-003',
    date: '2026-11-05',
    downPaymentCents: 0,
    termMonths: 36,
    actor: 'team-test',
    answers: approvedAnswers,
  };
  const application = await createApplication(db, submission);
  if (!application.ok) throw new Error(`expected approved application, got ${application.reason}`);
  const contract = await createContract(db, {
    applicationId: application.application.id,
    signedOn: '2026-11-05',
    actor: 'team-test',
  });
  if (!contract.ok) throw new Error(`expected active contract, got ${contract.reason}`);
  return contract.contract;
}

async function generateAndSettleRent(contractId: string) {
  const schedule = await generateInvoices(db, { contractId, actor: 'team-test' }, '2029-11-05');
  if (!schedule.ok) throw new Error(`expected invoice schedule, got ${schedule.reason}`);

  for (const invoice of schedule.invoices) {
    await db.payment.create({
      data: {
        id: randomUUID(),
        invoice_id: invoice.id,
        amount_cents: invoice.totalCents,
        paid_on: invoice.dueOn,
      },
    });
    await db.invoice.update({ where: { id: invoice.id }, data: { status: 'paid' } });
  }
}

const returnedRequest: EndOfTermRequest = {
  action: 'returned',
  completedOn: '2029-11-05',
  actor: 'team-test',
};

describe('completeContract', () => {
  it('completes a return and writes the asset passport and audit entry', async () => {
    const contract = await createActiveContract();
    await generateAndSettleRent(contract.id);

    const result = await completeContract(db, contract.id, returnedRequest);

    expect(result).toEqual({
      ok: true,
      contract: {
        id: contract.id,
        assetId: 'ebike-003',
        status: 'completed',
        action: 'returned',
        completedOn: '2029-11-05',
        buyoutCents: 58_350,
        buyoutPaidCents: null,
      },
    });
    expect(await db.contract.findUniqueOrThrow({ where: { id: contract.id } })).toMatchObject({
      status: 'completed',
      end_of_term_action: 'returned',
      completed_on: '2029-11-05',
      buyout_paid_cents: null,
    });
    expect((await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } })).status).toBe(
      'returned'
    );
    expect(await db.assetHistory.findFirstOrThrow({ orderBy: { id: 'desc' } })).toMatchObject({
      event_type: 'returned',
      from_status: 'reserved',
      to_status: 'returned',
      occurred_on: '2029-11-05',
    });
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: 'contract.completed' } })
    ).toMatchObject({
      entity_id: contract.id,
      actor: 'team-test',
    });
  });

  it('records pass-on separately while returning the asset to second-life inventory', async () => {
    const contract = await createActiveContract();
    await generateAndSettleRent(contract.id);

    const result = await completeContract(db, contract.id, {
      action: 'passed_on',
      completedOn: '2029-11-06',
      actor: 'team-test',
    });

    expect(result).toMatchObject({ ok: true, contract: { action: 'passed_on' } });
    expect(await db.assetHistory.findFirstOrThrow({ orderBy: { id: 'desc' } })).toMatchObject({
      event_type: 'passed_on',
      to_status: 'returned',
    });
    expect(
      JSON.parse(
        (await db.assetHistory.findFirstOrThrow({ orderBy: { id: 'desc' } })).details_json ?? ''
      )
    ).toEqual({
      action: 'passed_on',
    });
  });

  it('completes a buyout only for the exact locked amount', async () => {
    const contract = await createActiveContract();
    await generateAndSettleRent(contract.id);

    const mismatch = await completeContract(db, contract.id, {
      action: 'bought',
      completedOn: '2029-11-05',
      buyoutPaidCents: contract.buyoutCents - 1,
      actor: 'team-test',
    });
    expect(mismatch).toEqual({
      ok: false,
      reason: 'buyout_amount_mismatch',
      expectedCents: contract.buyoutCents,
      receivedCents: contract.buyoutCents - 1,
    });

    const result = await completeContract(db, contract.id, {
      action: 'bought',
      completedOn: '2029-11-05',
      buyoutPaidCents: contract.buyoutCents,
      actor: 'team-test',
    });
    expect(result).toMatchObject({
      ok: true,
      contract: { action: 'bought', buyoutPaidCents: contract.buyoutCents },
    });
    expect((await db.asset.findUniqueOrThrow({ where: { id: contract.assetId } })).status).toBe(
      'sold'
    );
  });

  it('rejects missing schedules, unpaid rent, early completion, and wrong asset state', async () => {
    const contract = await createActiveContract();
    await expect(completeContract(db, contract.id, returnedRequest)).resolves.toEqual({
      ok: false,
      reason: 'invoice_schedule_not_generated',
    });

    await generateAndSettleRent(contract.id);
    const invoice = await db.invoice.findFirstOrThrow();
    await db.payment.deleteMany({ where: { invoice_id: invoice.id } });
    await db.invoice.update({ where: { id: invoice.id }, data: { status: 'issued' } });
    await expect(completeContract(db, contract.id, returnedRequest)).resolves.toMatchObject({
      ok: false,
      reason: 'rent_balance_outstanding',
    });

    await db.payment.create({
      data: {
        id: randomUUID(),
        invoice_id: invoice.id,
        amount_cents: invoice.total_cents,
        paid_on: invoice.due_on,
      },
    });
    await db.invoice.update({ where: { id: invoice.id }, data: { status: 'paid' } });
    await expect(
      completeContract(db, contract.id, { ...returnedRequest, completedOn: '2029-11-04' })
    ).resolves.toMatchObject({ ok: false, reason: 'term_not_finished' });

    await db.asset.update({ where: { id: contract.assetId }, data: { status: 'available' } });
    await expect(completeContract(db, contract.id, returnedRequest)).resolves.toMatchObject({
      ok: false,
      reason: 'asset_not_reserved',
    });
    expect(await db.contract.findUniqueOrThrow({ where: { id: contract.id } })).toMatchObject({
      status: 'active',
    });
    expect(await db.auditLog.count({ where: { action: 'contract.completed' } })).toBe(0);
  });
});
