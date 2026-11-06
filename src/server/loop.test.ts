// The Spine as one story: ebike-003 and Aino go round the loop on a test database.
// Each block of the pipeline adds its step here. Figures come from scenario card 1.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import { ainoEbikeAnswers } from '../../tests/helpers/applicants';
import { createTestDb } from '../../tests/helpers/test-db';
import { setDemoDate } from './date/app-date';
import { submitApplication } from './application/applications';
import { seedAssets } from './assets/assets';
import { signContract } from './contract/contracts';
import { listInvoices } from './invoicing/invoices';
import type { PrismaClient } from './prisma-client';
import { quoteAsset } from './pricing/quotes';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  await seedAssets(db, await loadAssets());
});
afterAll(async () => {
  await cleanup();
});

describe('the lease loop', () => {
  it('takes ebike-003 round the loop', async () => {
    // The app runs on 5 Nov 2026, the day card 1 is signed.
    await setDemoDate(db, { date: '2026-11-05', actor: 'staff-admin' });

    // 1. Price
    const quoted = await quoteAsset(db, {
      assetId: 'ebike-003',
      date: '2026-11-05',
      termMonths: 36,
      downPaymentCents: 0,
    });

    expect(quoted).toMatchObject({
      ok: true,
      quote: {
        monthly_net_rent_cents: 10_730,
        monthly_vat_cents: 2_736,
        monthly_total_cents: 13_466,
        buyout_cents: 58_350,
      },
    });

    // 2. Application
    const customers = await loadCustomers();
    const aino = customers.find((customer) => customer.id === 'cust-aino');
    if (!aino) throw new Error('expected cust-aino in the data pack');

    const applied = await submitApplication(db, {
      customer: aino,
      assetId: 'ebike-003',
      quantity: 1,
      termMonths: 36,
      downPaymentCents: 0,
      answers: ainoEbikeAnswers,
    });
    expect(applied).toMatchObject({
      ok: true,
      application: {
        decision: 'approved',
        quote_date: '2026-11-05',
        price_list_version: 1,
        financed_cents: 389_000,
      },
    });
    if (!applied.ok) throw new Error(applied.reason);

    // 3. Contract
    const signed = await signContract(db, {
      applicationId: applied.application.id,
      customer: aino,
    });
    expect(signed).toMatchObject({
      ok: true,
      contract: {
        status: 'active',
        monthly_net_rent_cents: 10_730,
        buyout_cents: 58_350,
        planned_end_on: '2029-11-04',
      },
    });
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    expect(asset.status).toBe('leased');
    if (!signed.ok) throw new Error(signed.reason);

    // 4. Invoices
    const invoices = await listInvoices(db, { contractId: signed.contract.id });
    expect(invoices).toHaveLength(36);
    expect(invoices.slice(0, 3).map((invoice) => invoice.total_cents)).toEqual([
      13_466, 13_466, 13_520,
    ]);
  });
});
