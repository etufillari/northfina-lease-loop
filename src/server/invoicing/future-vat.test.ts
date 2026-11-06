// Runs against a real, migrated SQLite database. Only the VAT rates are swapped, to play out a
// rate that is announced after a contract was signed.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadVatRates } from '@/data/load';
import type * as DataLoad from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { ainoEbikeAnswers } from '../../../tests/helpers/applicants';
import { applyFor, resetLeaseData, signFor } from '../../../tests/helpers/lease-flow';
import { createTestDb } from '../../../tests/helpers/test-db';
import { contractViews, getContract } from '../contract/contracts';
import type { PrismaClient } from '../prisma-client';
import { refreshFutureVat } from './future-vat';
import { listInvoices } from './invoices';

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

async function signAino(assetId = 'ebike-003') {
  const application = await applyFor(db, 'cust-aino', assetId, ainoEbikeAnswers);
  return signFor(db, 'cust-aino', application.id);
}

/** Today's rates, then 27 % from 1 July 2027. */
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

const updates = () => db.auditLog.findMany({ where: { action: 'invoice.vat_updated' } });

describe('refreshFutureVat', () => {
  it('changes nothing and logs nothing while the rates are the same', async () => {
    await signAino();

    expect(await refreshFutureVat(db, '2026-11-05')).toEqual({ updated: 0 });
    expect(await updates()).toEqual([]);
  });

  it('moves invoices from the new date onto the new rate, and keeps the rent', async () => {
    const contract = await signAino();
    await announceNewRate();

    expect(await refreshFutureVat(db, '2026-11-05')).toEqual({ updated: 28 });

    const invoices = await listInvoices(db, { contractId: contract.id });
    expect(invoices[7]).toMatchObject({ invoice_date: '2027-06-05', vat_rate_percent: 26 });
    expect(invoices[8]).toMatchObject({
      invoice_date: '2027-07-05',
      vat_rate_percent: 27,
      net_cents: 10_730,
      vat_cents: 2_897,
      total_cents: 13_627,
    });
  });

  it('never touches an invoice dated today or earlier', async () => {
    const contract = await signAino();
    await announceNewRate();

    expect(await refreshFutureVat(db, '2027-07-05')).toEqual({ updated: 27 });

    const invoices = await listInvoices(db, { contractId: contract.id });
    expect(invoices[8]).toMatchObject({ invoice_date: '2027-07-05', vat_rate_percent: 26 });
    expect(invoices[9]).toMatchObject({ invoice_date: '2027-08-05', vat_rate_percent: 27 });
  });

  it('leaves a paid invoice alone', async () => {
    const contract = await signAino();
    await db.invoice.updateMany({
      where: { contract_id: contract.id, sequence: 9 },
      data: { status: 'paid' },
    });
    await announceNewRate();

    expect(await refreshFutureVat(db, '2026-11-05')).toEqual({ updated: 27 });
  });

  it('explains the new change on the invoice and in the totals', async () => {
    const contract = await signAino();
    await announceNewRate();
    await refreshFutureVat(db, '2026-11-05');

    const invoices = await listInvoices(db, { contractId: contract.id });
    expect(invoices[8]?.vat_change).toMatchObject({
      from_percent: 26,
      to_percent: 27,
      net_change_cents: 0,
      total_change_cents: 107,
    });

    const stored = await getContract(db, contract.id);
    if (!stored) throw new Error('expected the contract');
    const [view] = await contractViews(db, [stored]);
    expect(view?.total_net_cents).toBe(386_280);
    expect(view?.total_cents).toBe(invoices.reduce((sum, i) => sum + i.total_cents, 0));
    expect(view?.total_cents).toBeGreaterThan(486_612);
  });

  it('writes one audit row per contract, as the system', async () => {
    const first = await signAino('ebike-003');
    const second = await signAino('laptop-004');
    await announceNewRate();
    await refreshFutureVat(db, '2026-11-05');

    const rows = await updates();
    expect(rows.map((row) => row.entity_id).sort()).toEqual([first.id, second.id].sort());
    expect(rows[0]).toMatchObject({ actor: 'system', entity_type: 'contract' });

    const details = JSON.parse(rows[0]?.details_json ?? '{}');
    expect(details.invoices[0]).toEqual({ sequence: 9, from_percent: 26, to_percent: 27 });
  });

  it('does nothing the second time', async () => {
    await signAino();
    await announceNewRate();
    await refreshFutureVat(db, '2026-11-05');

    expect(await refreshFutureVat(db, '2026-11-05')).toEqual({ updated: 0 });
    expect(await updates()).toHaveLength(1);
  });
});
