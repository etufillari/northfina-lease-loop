// Scenario cards 3 and 4, through the same services the API uses.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ainoEbikeAnswers } from '../../../tests/helpers/applicants';
import { applyFor, resetLeaseData, signFor } from '../../../tests/helpers/lease-flow';
import { createTestDb } from '../../../tests/helpers/test-db';
import type { PrismaClient } from '../prisma-client';
import { listInvoices } from './invoices';

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

async function signOn(date: string, assetId: string, termMonths: number) {
  await db.appSetting.update({ where: { key: 'demo_date' }, data: { value: date } });
  const application = await applyFor(db, 'cust-aino', assetId, ainoEbikeAnswers, { termMonths });
  return signFor(db, 'cust-aino', application.id);
}

describe('card 3: tax is not price', () => {
  it('shows the December and January invoices either side of the VAT change', async () => {
    const contract = await signOn('2026-09-15', 'ebike-001', 24);
    const invoices = await listInvoices(db, { contractId: contract.id });

    expect(invoices[3]).toMatchObject({
      invoice_date: '2026-12-15',
      vat_rate_percent: 25.5,
      total_cents: 8_731,
    });
    expect(invoices[4]).toMatchObject({
      invoice_date: '2027-01-15',
      vat_rate_percent: 26,
      net_cents: 6_957,
      total_cents: 8_766,
    });
  });
});

describe('card 4: calendar traps', () => {
  it('gives the February due dates for a start on 31 January', async () => {
    const contract = await signOn('2026-01-31', 'laptop-001', 36);
    const invoices = await listInvoices(db, { contractId: contract.id });

    expect(invoices[1]).toMatchObject({ invoice_date: '2026-02-28', due_date: '2026-02-28' });
    expect(invoices[25]).toMatchObject({ invoice_date: '2028-02-29', due_date: '2028-02-29' });
    expect(invoices).toHaveLength(36);
  });
});
