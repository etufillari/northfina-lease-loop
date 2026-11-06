// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ainoEbikeAnswers } from '../../../tests/helpers/applicants';
import { applyFor, resetLeaseData, signFor } from '../../../tests/helpers/lease-flow';
import { createTestDb } from '../../../tests/helpers/test-db';
import type { PrismaClient } from '../prisma-client';
import { getInvoice, listInvoices } from './invoices';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetLeaseData(db);
});

async function signedContract(customerId = 'cust-aino', assetId = 'ebike-003', term = 36) {
  const answers = { ...ainoEbikeAnswers, q_country: customerId === 'cust-lena' ? 'EE' : 'FI' };
  const application = await applyFor(db, customerId, assetId, answers, { termMonths: term });
  return signFor(db, customerId, application.id);
}

describe('invoices created at signing', () => {
  it('creates one invoice per month, in order (card 1)', async () => {
    const contract = await signedContract();
    const invoices = await listInvoices(db, { contractId: contract.id });

    expect(invoices).toHaveLength(36);
    expect(invoices.map((i) => i.sequence)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
    expect(invoices.slice(0, 3)).toMatchObject([
      { invoice_date: '2026-11-05', vat_cents: 2_736, total_cents: 13_466, status: 'issued' },
      { invoice_date: '2026-12-05', vat_cents: 2_736, total_cents: 13_466, status: 'issued' },
      { invoice_date: '2027-01-05', vat_cents: 2_790, total_cents: 13_520, status: 'issued' },
    ]);
  });

  it('gives the VAT rate as a percentage too', async () => {
    const contract = await signedContract();
    const [first, , third] = await listInvoices(db, { contractId: contract.id });
    expect(first).toMatchObject({ vat_rate_basis_points: 2_550, vat_rate_percent: 25.5 });
    expect(third).toMatchObject({ vat_rate_basis_points: 2_600, vat_rate_percent: 26 });
  });

  it('follows the signing date of card 3', async () => {
    await db.appSetting.update({ where: { key: 'demo_date' }, data: { value: '2026-09-15' } });
    const contract = await signedContract('cust-aino', 'ebike-001', 24);
    const invoices = await listInvoices(db, { contractId: contract.id });

    expect(invoices[3]).toMatchObject({ invoice_date: '2026-12-15', total_cents: 8_731 });
    expect(invoices[4]).toMatchObject({ invoice_date: '2027-01-15', total_cents: 8_766 });
  });

  it('follows the month-end dates of card 4', async () => {
    await db.appSetting.update({ where: { key: 'demo_date' }, data: { value: '2026-01-31' } });
    const contract = await signedContract('cust-aino', 'laptop-001');
    const invoices = await listInvoices(db, { contractId: contract.id });

    expect(invoices[1]?.due_date).toBe('2026-02-28');
    expect(invoices[25]?.due_date).toBe('2028-02-29');
  });
});

describe('listInvoices', () => {
  it('filters by customer, contract and status', async () => {
    const aino = await signedContract();
    const lena = await signedContract('cust-lena', 'ebike-001', 24);

    expect(await listInvoices(db)).toHaveLength(60);
    expect(await listInvoices(db, { customerId: 'cust-lena' })).toHaveLength(24);
    expect(await listInvoices(db, { contractId: aino.id })).toHaveLength(36);
    expect(await listInvoices(db, { status: 'paid' })).toEqual([]);
    expect(await listInvoices(db, { status: 'issued', contractId: lena.id })).toHaveLength(24);
  });

  it("keeps a customer away from another customer's contract", async () => {
    const aino = await signedContract();
    expect(await listInvoices(db, { customerId: 'cust-lena', contractId: aino.id })).toEqual([]);
  });

  it('gives an empty list when there are no invoices', async () => {
    expect(await listInvoices(db)).toEqual([]);
  });
});

describe('getInvoice', () => {
  it('finds an invoice and says whose it is', async () => {
    const contract = await signedContract();
    const [first] = await listInvoices(db, { contractId: contract.id });
    if (!first) throw new Error('expected an invoice');

    expect(await getInvoice(db, first.id)).toMatchObject({
      customerId: 'cust-aino',
      invoice: { id: first.id, sequence: 1, total_cents: 13_466, vat_rate_percent: 25.5 },
    });
  });

  it('reports an unknown invoice', async () => {
    expect(await getInvoice(db, 'nope')).toBeNull();
  });
});
