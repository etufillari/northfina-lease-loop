// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { adminOverview } from './admin';
import { submitApplication } from './applications';
import { seedAssets } from './assets';
import { signContract } from './contracts';
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

const adult = {
  q_customer_type: 'consumer',
  q_full_name: 'Aino Virtanen',
  q_birth_date: '1997-04-12',
  q_email: 'aino@example.com',
  q_country: 'FI',
  q_employment: 'employed',
};

describe('adminOverview', () => {
  it('counts contracts, decisions, invoices, items and shows the audit log', async () => {
    const approved = await submitApplication(
      db,
      { assetId: 'laptop-001', termMonths: 12, downPaymentCents: 0, answers: adult },
      '2026-11-05'
    );
    await submitApplication(
      db,
      {
        assetId: 'laptop-008',
        termMonths: 36,
        downPaymentCents: 0,
        answers: { q_customer_type: 'consumer', q_birth_date: '2009-03-10' },
      },
      '2026-11-05'
    );
    if (!approved.ok) throw new Error(approved.reason);
    await signContract(
      db,
      { applicationId: approved.application.id, signerName: 'Aino' },
      '2026-11-05'
    );

    // Two months on: invoice 1 paid at signing, invoices 2 and 3 due
    const overview = await adminOverview(db, '2027-01-10');
    expect(overview.contracts).toEqual({
      total: 1,
      not_started: 0,
      active: 1,
      ended: 0,
      returned: 0,
      bought: 0,
      passed_on: 0,
    });
    expect(overview.sold).toEqual({ count: 0, paidCents: 0, sales: [] });
    expect(overview.applications).toEqual({
      total: 2,
      approved: 1,
      manual_review: 0,
      rejected: 1,
    });
    // laptop-001: 6717 net. Dec 2026 at 25.5 % → 8430; Jan 2027 at 26 % → 8463
    expect(overview.invoices).toEqual({
      dueCount: 2,
      dueCents: 8_430 + 8_463,
      paidCount: 1,
      paidCents: 8_430,
    });
    // The data pack starts with 1 reserved and 6 returned items; signing leases laptop-001
    expect(overview.assets).toEqual({
      available: 22,
      leased: 1,
      reserved: 1,
      returned: 6,
      sold: 0,
    });
    // Newest first: the three invoices issued by 10 Jan 2027, then the signing and applications
    expect(overview.audit.map((a) => a.action)).toEqual([
      'invoice.issued',
      'invoice.issued',
      'invoice.issued',
      'contract.signed',
      'application.submitted',
      'application.submitted',
    ]);
  });
});
