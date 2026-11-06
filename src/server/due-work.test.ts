// Runs against a real, migrated SQLite database. Only the VAT rates are swapped, to play out a
// rate that is announced after a contract was signed.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadVatRates } from '@/data/load';
import type * as DataLoad from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { ainoEbikeAnswers } from '../../tests/helpers/applicants';
import { applyFor, resetLeaseData, signFor } from '../../tests/helpers/lease-flow';
import { createTestDb } from '../../tests/helpers/test-db';
import { runDueWork } from './due-work';
import type { PrismaClient } from './prisma-client';

const announced = vi.hoisted(() => ({ rates: undefined as VatRates | undefined }));
vi.mock('@/data/load', async (importOriginal) => {
  const actual = await importOriginal<typeof DataLoad>();
  return { ...actual, loadVatRates: async () => announced.rates ?? actual.loadVatRates() };
});

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  announced.rates = undefined;
  await resetLeaseData(db);
});

async function signOn(date: string, assetId: string, termMonths: number) {
  await db.appSetting.update({ where: { key: 'demo_date' }, data: { value: date } });
  const application = await applyFor(db, 'cust-aino', assetId, ainoEbikeAnswers, { termMonths });
  return signFor(db, 'cust-aino', application.id);
}

async function announceNewRate() {
  const rates = await loadVatRates();
  announced.rates = {
    ...rates,
    rates: [
      ...rates.rates.map((rate) =>
        rate.valid_to === null ? { ...rate, valid_to: '2027-06-30' } : rate
      ),
      { rate_percent: 27, valid_from: '2027-07-01', valid_to: null },
    ],
  };
}

describe('runDueWork', () => {
  it('closes expired contracts and updates future invoices in one go', async () => {
    const ended = await signOn('2026-02-01', 'ebike-001', 12);
    const running = await signOn('2026-11-05', 'ebike-003', 36);
    await announceNewRate();

    await runDueWork(db, '2027-03-01');

    const closed = await db.contract.findUniqueOrThrow({ where: { id: ended.id } });
    const invoice = await db.invoice.findFirstOrThrow({
      where: { contract_id: running.id, invoice_date: '2027-07-05' },
    });
    expect(closed.status).toBe('returned');
    expect(invoice.vat_rate_basis_points).toBe(2_700);
  });

  it('changes nothing when nothing is due', async () => {
    await signOn('2026-11-05', 'ebike-003', 36);
    const rowsBefore = await db.auditLog.count();

    await runDueWork(db, '2026-11-06');

    expect(await db.auditLog.count()).toBe(rowsBefore);
  });
});
