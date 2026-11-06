// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { submitApplication } from './applications';
import { seedAssets } from './assets';
import { signContract } from './contracts';
import { contractInvoices, payInvoice, receivedInvoices } from './invoices';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.invoicePayment.deleteMany();
  await db.contract.deleteMany();
  await db.application.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

/** Aino leases laptop-001 for 12 months from 5 Nov 2026 (no income question under €2,000). */
async function ainosContract(customerId: string | null = 'cust-aino') {
  const application = await submitApplication(
    db,
    {
      assetId: 'laptop-001',
      termMonths: 12,
      downPaymentCents: 0,
      customerId,
      answers: {
        q_customer_type: 'consumer',
        q_full_name: 'Aino Virtanen',
        q_birth_date: '1997-04-12',
        q_email: 'aino@example.com',
        q_country: 'FI',
        q_employment: 'employed',
      },
    },
    '2026-11-05'
  );
  if (!application.ok) throw new Error(application.reason);
  const signed = await signContract(
    db,
    { applicationId: application.application.id, signerName: 'Aino Virtanen' },
    '2026-11-05'
  );
  if (!signed.ok) throw new Error(signed.reason);
  return signed.contract;
}

describe('payInvoice', () => {
  it('pays an issued invoice, stores the amount and writes an audit row', async () => {
    const contract = await ainosContract();
    const result = await payInvoice(
      db,
      { contractId: contract.id, invoiceNumber: 1, actor: 'Aino Virtanen' },
      '2026-11-10'
    );
    // laptop-001: 119900 × 0.056022 = 6717 net, + 25.5 % VAT 1713 = 8430
    expect(result).toEqual({ ok: true, paidDate: '2026-11-10', amountCents: 8_430 });

    const invoices = await contractInvoices(db, contract, '2026-11-10');
    expect(invoices?.[0]).toMatchObject({ status: 'paid', paidDate: '2026-11-10' });
    const audit = await db.auditLog.findMany({ where: { action: 'invoice.paid' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.entity_id).toBe(`${contract.id}#1`);
  });

  it('refuses an invoice that has not been issued yet', async () => {
    const contract = await ainosContract();
    expect(
      await payInvoice(
        db,
        { contractId: contract.id, invoiceNumber: 2, actor: 'Aino' },
        '2026-12-04'
      )
    ).toEqual({ ok: false, reason: 'not_issued' });
  });

  it('refuses to pay the same invoice twice', async () => {
    const contract = await ainosContract();
    const pay = () =>
      payInvoice(db, { contractId: contract.id, invoiceNumber: 1, actor: 'Aino' }, '2026-11-05');
    await pay();
    expect(await pay()).toEqual({ ok: false, reason: 'already_paid' });
    expect(await db.invoicePayment.count()).toBe(1);
  });

  it('refuses unknown contracts and invoice numbers outside the term', async () => {
    const contract = await ainosContract();
    expect(
      await payInvoice(db, { contractId: 'nope', invoiceNumber: 1, actor: 'Aino' }, '2026-11-05')
    ).toEqual({ ok: false, reason: 'contract_not_found' });
    expect(
      await payInvoice(
        db,
        { contractId: contract.id, invoiceNumber: 13, actor: 'Aino' },
        '2030-01-01'
      )
    ).toEqual({ ok: false, reason: 'invoice_not_found' });
  });
});

describe('receivedInvoices', () => {
  it('lists only the invoices that have arrived, newest first, per customer', async () => {
    const contract = await ainosContract();
    await payInvoice(
      db,
      { contractId: contract.id, invoiceNumber: 1, actor: 'Aino' },
      '2026-11-05'
    );

    const received = await receivedInvoices(db, { customerId: 'cust-aino' }, '2027-01-10');
    expect(received.map((r) => [r.invoice.number, r.invoice.status])).toEqual([
      [3, 'due'],
      [2, 'due'],
      [1, 'paid'],
    ]);
    expect(await receivedInvoices(db, { customerId: 'cust-mikko' }, '2027-01-10')).toEqual([]);
    expect(await receivedInvoices(db, null, '2027-01-10')).toHaveLength(3);
  });
});
