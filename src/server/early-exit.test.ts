import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import type { Asset } from '@/data/schemas';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import { createApplication, type ApplicationSubmissionRequest } from './applications';
import { createContract } from './contracts';
import { processEarlyExit, quoteEarlyExit, requestEarlyExit } from './early-exit';
import { generateInvoices } from './invoices';
import { recordPayment } from './payments';
import { seedCustomers } from './customers';
import type { PrismaClient } from './prisma-client';

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
  await db.earlyExitRequest.deleteMany();
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

async function prepareInvoices(contractId: string) {
  const generated = await generateInvoices(db, { contractId, actor: 'team-test' });
  if (!generated.ok) throw new Error(`expected invoices, got ${generated.reason}`);
  return generated.invoices;
}

async function payInvoice(contractId: string, invoiceId: string, totalCents: number) {
  const payment = await recordPayment(db, {
    contractId,
    invoiceId,
    amountCents: totalCents,
    paidOn: '2026-11-05',
    actor: 'team-test',
  });
  if (!payment.ok) throw new Error(`expected payment, got ${payment.reason}`);
}

describe('early exit service', () => {
  it('quotes and schedules a return for the next invoice anniversary', async () => {
    const contract = await createActiveContract();
    const invoices = await prepareInvoices(contract.id);

    const quote = await quoteEarlyExit(db, contract.id, {
      action: 'returned',
      requestedOn: '2026-11-06',
    });
    expect(quote).toMatchObject({
      ok: true,
      quote: {
        quote: {
          effectiveOn: '2026-12-05',
          completedMonths: 1,
          remainingMonths: 35,
        },
        vatRateBasisPoints: 2_550,
      },
    });

    await payInvoice(contract.id, invoices[0]!.id, invoices[0]!.totalCents);
    const request = await requestEarlyExit(db, contract.id, {
      action: 'returned',
      requestedOn: '2026-11-06',
      actor: 'team-test',
    });
    expect(request).toMatchObject({
      ok: true,
      request: { status: 'pending', effectiveOn: '2026-12-05', action: 'returned' },
    });
    expect(await db.auditLog.count({ where: { action: 'contract.early_exit_requested' } })).toBe(1);
  });

  it('waits until the effective date, then returns the asset and cancels future invoices', async () => {
    const contract = await createActiveContract();
    const invoices = await prepareInvoices(contract.id);
    await payInvoice(contract.id, invoices[0]!.id, invoices[0]!.totalCents);
    const request = await requestEarlyExit(db, contract.id, {
      action: 'returned',
      requestedOn: '2026-11-06',
      actor: 'team-test',
    });
    if (!request.ok) throw new Error(`expected request, got ${request.reason}`);

    await expect(
      processEarlyExit(db, contract.id, {
        processedOn: '2026-12-04',
        settlementPaidCents: request.request.settlementTotalCents,
        actor: 'team-test',
      })
    ).resolves.toEqual({
      ok: false,
      reason: 'early_exit_not_due',
      effectiveOn: '2026-12-05',
      processedOn: '2026-12-04',
    });

    const result = await processEarlyExit(db, contract.id, {
      processedOn: '2026-12-05',
      settlementPaidCents: request.request.settlementTotalCents,
      actor: 'team-test',
    });
    expect(result).toMatchObject({
      ok: true,
      termination: { status: 'completed', action: 'returned' },
    });
    expect(await db.contract.findUniqueOrThrow({ where: { id: contract.id } })).toMatchObject({
      status: 'terminated',
      termination_action: 'returned',
      terminated_on: '2026-12-05',
    });
    expect(await db.asset.findUniqueOrThrow({ where: { id: contract.assetId } })).toMatchObject({
      status: 'returned',
    });
    expect(
      await db.invoice.count({ where: { contract_id: contract.id, status: 'cancelled' } })
    ).toBe(35);
    expect(await db.auditLog.count({ where: { action: 'contract.early_exit_completed' } })).toBe(1);
    expect(await db.assetHistory.count({ where: { event_type: 'returned' } })).toBe(1);
  });

  it('requires the exact settlement and all prior rent before processing', async () => {
    const contract = await createActiveContract();
    await prepareInvoices(contract.id);
    const request = await requestEarlyExit(db, contract.id, {
      action: 'bought',
      requestedOn: '2026-12-06',
      actor: 'team-test',
    });
    if (!request.ok) throw new Error(`expected request, got ${request.reason}`);

    await expect(
      processEarlyExit(db, contract.id, {
        processedOn: '2027-01-05',
        settlementPaidCents: request.request.settlementTotalCents - 1,
        actor: 'team-test',
      })
    ).resolves.toEqual({
      ok: false,
      reason: 'settlement_amount_mismatch',
      expectedCents: request.request.settlementTotalCents,
      receivedCents: request.request.settlementTotalCents - 1,
    });

    await expect(
      processEarlyExit(db, contract.id, {
        processedOn: '2027-01-05',
        settlementPaidCents: request.request.settlementTotalCents,
        actor: 'team-test',
      })
    ).resolves.toMatchObject({ ok: false, reason: 'rent_balance_outstanding' });
    expect(await db.contract.findUniqueOrThrow({ where: { id: contract.id } })).toMatchObject({
      status: 'active',
    });
  });

  it('supports an early buyout and is idempotent after completion', async () => {
    const contract = await createActiveContract();
    const invoices = await prepareInvoices(contract.id);
    await payInvoice(contract.id, invoices[0]!.id, invoices[0]!.totalCents);
    const request = await requestEarlyExit(db, contract.id, {
      action: 'bought',
      requestedOn: '2026-11-06',
      actor: 'team-test',
    });
    if (!request.ok) throw new Error(`expected request, got ${request.reason}`);

    const result = await processEarlyExit(db, contract.id, {
      processedOn: '2026-12-05',
      settlementPaidCents: request.request.settlementTotalCents,
      actor: 'team-test',
    });
    expect(result).toMatchObject({ ok: true, termination: { action: 'bought' } });
    expect(await db.asset.findUniqueOrThrow({ where: { id: contract.assetId } })).toMatchObject({
      status: 'sold',
    });

    await expect(
      processEarlyExit(db, contract.id, {
        processedOn: '2026-12-06',
        settlementPaidCents: 0,
        actor: 'different-actor',
      })
    ).resolves.toMatchObject({ ok: true, termination: { action: 'bought', status: 'completed' } });
  });
});
