import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import type { Asset } from '@/data/schemas';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import { createApplication, type ApplicationSubmissionRequest } from './applications';
import { createContract } from './contracts';
import { generateInvoices } from './invoices';
import { listInvoicePayments, recordPayment } from './payments';
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

async function createInvoice() {
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

  const schedule = await generateInvoices(
    db,
    { contractId: contract.contract.id, actor: 'team-test' },
    '2026-11-05'
  );
  if (!schedule.ok) throw new Error(`expected invoice schedule, got ${schedule.reason}`);
  const invoice = schedule.invoices[0];
  if (!invoice) throw new Error('expected at least one invoice');
  return { contract: contract.contract, invoice };
}

describe('recordPayment', () => {
  it('records partial payments and marks the invoice paid at exact settlement', async () => {
    const { contract, invoice } = await createInvoice();

    const partial = await recordPayment(
      db,
      {
        contractId: contract.id,
        invoiceId: invoice.id,
        amountCents: 5_000,
        paidOn: '2026-11-05',
        reference: 'bank-001',
        actor: 'team-test',
      },
      '2026-11-05'
    );
    expect(partial).toMatchObject({
      ok: true,
      invoice: {
        paymentStatus: 'partially_paid',
        totalPaidCents: 5_000,
        remainingCents: invoice.totalCents - 5_000,
        isOverdue: false,
      },
    });

    const final = await recordPayment(
      db,
      {
        contractId: contract.id,
        invoiceId: invoice.id,
        amountCents: invoice.totalCents - 5_000,
        paidOn: '2026-11-06',
        actor: 'team-test',
      },
      '2026-11-06'
    );
    expect(final).toMatchObject({
      ok: true,
      invoice: {
        status: 'paid',
        paymentStatus: 'paid',
        totalPaidCents: invoice.totalCents,
        remainingCents: 0,
        isOverdue: false,
      },
    });
    expect(await db.payment.count()).toBe(2);
    expect(await db.auditLog.count({ where: { action: 'invoice.payment_recorded' } })).toBe(2);
  });

  it('derives overdue status without changing the invoice row', async () => {
    const { contract, invoice } = await createInvoice();
    const result = await listInvoicePayments(
      db,
      { contractId: contract.id, invoiceId: invoice.id },
      '2026-11-06'
    );

    expect(result).toMatchObject({
      ok: true,
      invoice: { paymentStatus: 'unpaid', remainingCents: invoice.totalCents, isOverdue: true },
    });
    expect(await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({
      status: 'issued',
    });
  });

  it('rejects overpayment and future-dated payments without writes', async () => {
    const { contract, invoice } = await createInvoice();

    await expect(
      recordPayment(
        db,
        {
          contractId: contract.id,
          invoiceId: invoice.id,
          amountCents: invoice.totalCents + 1,
          paidOn: '2026-11-05',
          actor: 'team-test',
        },
        '2026-11-05'
      )
    ).resolves.toEqual({
      ok: false,
      reason: 'payment_exceeds_balance',
      remainingCents: invoice.totalCents,
    });
    await expect(
      recordPayment(
        db,
        {
          contractId: contract.id,
          invoiceId: invoice.id,
          amountCents: 1,
          paidOn: '2026-11-06',
          actor: 'team-test',
        },
        '2026-11-05'
      )
    ).resolves.toEqual({ ok: false, reason: 'payment_date_in_future' });
    expect(await db.payment.count()).toBe(0);
    expect(await db.auditLog.count({ where: { action: 'invoice.payment_recorded' } })).toBe(0);
  });

  it('rejects cancelled invoices and unknown resources', async () => {
    await expect(
      recordPayment(db, {
        contractId: 'missing',
        invoiceId: 'missing',
        amountCents: 1,
        paidOn: '2026-11-05',
        actor: 'team-test',
      })
    ).resolves.toEqual({ ok: false, reason: 'contract_not_found' });

    const { contract, invoice } = await createInvoice();
    await db.invoice.update({ where: { id: invoice.id }, data: { status: 'cancelled' } });
    await expect(
      recordPayment(db, {
        contractId: contract.id,
        invoiceId: invoice.id,
        amountCents: 1,
        paidOn: '2026-11-05',
        actor: 'team-test',
      })
    ).resolves.toEqual({ ok: false, reason: 'invoice_cancelled' });
    await expect(
      listInvoicePayments(db, { contractId: contract.id, invoiceId: 'missing' })
    ).resolves.toEqual({ ok: false, reason: 'invoice_not_found' });
  });
});
