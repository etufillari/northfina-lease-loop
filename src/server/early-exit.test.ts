// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { submitApplication } from './applications';
import { seedAssets } from './assets';
import { getContract, signContract } from './contracts';
import { earlyExitFor, exitEarly } from './early-exit';
import { contractInvoices, payAllDue } from './invoices';
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
  for (const table of [
    'invoiceIssue',
    'invoicePayment',
    'contract',
    'application',
    'auditLog',
    'asset',
  ] as const) {
    await (db[table] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await seedAssets(db, await loadAssets());
});

/** Scenario card 1/8: Aino leases ebike-003 for 36 months on 5 Nov 2026. */
async function ainosLease() {
  const applied = await submitApplication(
    db,
    {
      assetId: 'ebike-003',
      termMonths: 36,
      downPaymentCents: 0,
      answers: {
        q_customer_type: 'consumer',
        q_full_name: 'Aino Virtanen',
        q_birth_date: '1997-04-12',
        q_email: 'aino@example.com',
        q_country: 'FI',
        q_employment: 'employed',
        q_monthly_income: '3200',
        q_usage_purpose: 'commuting',
      },
    },
    '2026-11-05'
  );
  if (!applied.ok) throw new Error(applied.reason);
  const signed = await signContract(
    db,
    { applicationId: applied.application.id, signerName: 'Aino Virtanen' },
    '2026-11-05'
  );
  if (!signed.ok) throw new Error(signed.reason);
  return signed.contract;
}

const MONTH_7 = '2027-05-20'; // invoices 1–7 have been issued

describe('early exit (scenario card 8)', () => {
  it('quotes month 7 of 36: 29 rents left, discounted at band B, against today’s value', async () => {
    const contract = await ainosLease();
    const info = await earlyExitFor(db, contract, MONTH_7);
    if (!info.ok) throw new Error(info.reason);
    expect(info.quote).toMatchObject({
      remainingMonths: 29,
      presentRentsCents: 282_427,
      presentBuyoutCents: 48_239,
      stillOwedCents: 330_666,
      marketValueCents: 287_860,
    });
    expect(info.quote.return.netCents).toBe(42_806);
    expect(info.unpaidCount).toBe(6); // invoices 2–7; invoice 1 was paid at signing
  });

  it('asks for the open invoices first, then returns the item for the exit fee', async () => {
    const contract = await ainosLease();
    expect(
      await exitEarly(db, { contractId: contract.id, choice: 'return', actor: 'Aino' }, MONTH_7)
    ).toEqual({
      ok: false,
      reason: 'unpaid_invoices',
    });
    await payAllDue(db, { contractId: contract.id, filter: null, actor: 'Aino' }, MONTH_7);
    // 42806 net + 26 % VAT (11130) = 53936
    expect(
      await exitEarly(db, { contractId: contract.id, choice: 'return', actor: 'Aino' }, MONTH_7)
    ).toEqual({
      ok: true,
      paidCents: 53_936,
    });
    expect(await getContract(db, contract.id)).toMatchObject({
      status: 'returned',
      exitedEarlyDate: MONTH_7,
      exitFeeCents: 53_936,
    });
    expect(await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } })).toMatchObject({
      status: 'returned',
      previous_lives: 1,
    });
    expect(await db.auditLog.count({ where: { action: 'contract.exited_early' } })).toBe(1);
  });

  it('cancels the invoices after the exit day', async () => {
    const contract = await ainosLease();
    await payAllDue(db, { contractId: contract.id, filter: null, actor: 'Aino' }, MONTH_7);
    await exitEarly(db, { contractId: contract.id, choice: 'buy', actor: 'Aino' }, MONTH_7);
    const after = await getContract(db, contract.id);
    if (!after) throw new Error('gone');
    expect(await contractInvoices(db, after, '2029-01-01')).toHaveLength(7);
    expect(after).toMatchObject({ status: 'bought', boughtDate: MONTH_7 });
    expect(await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } })).toMatchObject({
      status: 'sold',
    });
  });

  it('is free to return within the first month', async () => {
    const contract = await ainosLease();
    expect(
      await exitEarly(
        db,
        { contractId: contract.id, choice: 'return', actor: 'Aino' },
        '2026-11-20'
      )
    ).toEqual({ ok: true, paidCents: 0 });
  });

  it('refuses a lease that has already ended or hasn’t started', async () => {
    const contract = await ainosLease();
    for (const date of ['2029-11-05', '2026-11-04']) {
      expect(
        await exitEarly(db, { contractId: contract.id, choice: 'buy', actor: 'Aino' }, date)
      ).toMatchObject({
        ok: false,
      });
    }
  });
});
