// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { submitApplication } from './applications';
import { assetOn, assetsOn, hasLaterHistory } from './asset-state';
import { seedAssets } from './assets';
import { listContracts, signContract } from './contracts';
import { returnContract } from './end-of-term';
import { payAllDue } from './invoices';
import type { PrismaClient } from './prisma-client';
import { refurbishItem } from './second-life';

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
    'refurbishment',
    'handover',
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

/** laptop-001: leased 15 Sep 2026 for 12 months, returned 15 Sep 2027, refurbished 1 Oct 2027. */
async function oneFullLife() {
  const applied = await submitApplication(
    db,
    {
      assetId: 'laptop-001',
      termMonths: 12,
      downPaymentCents: 0,
      answers: {
        q_customer_type: 'consumer',
        q_full_name: 'Aino Virtanen',
        q_birth_date: '1997-04-12',
        q_email: 'aino@example.com',
        q_country: 'FI',
        q_employment: 'employed',
      },
    },
    '2026-09-15'
  );
  if (!applied.ok) throw new Error(applied.reason);
  const signed = await signContract(
    db,
    { applicationId: applied.application.id, signerName: 'Aino Virtanen' },
    '2026-09-15'
  );
  if (!signed.ok) throw new Error(signed.reason);
  await payAllDue(
    db,
    { contractId: signed.contract.id, filter: null, actor: 'Aino' },
    '2027-09-15'
  );
  await returnContract(db, { contractId: signed.contract.id, actor: 'Aino' }, '2027-09-15');
  const refurbished = await refurbishItem(
    db,
    {
      assetId: 'laptop-001',
      conditionFound: 'good',
      usageFound: 120,
      conditionAfter: 'good',
      presetIds: [],
      customRepairs: [],
      priceCents: 80_000,
      notes: null,
      actor: 'admin',
    },
    '2027-10-01'
  );
  if (!refurbished.ok) throw new Error(refurbished.reason);
  return signed.contract;
}

describe('items and contracts as they were on a date', () => {
  it('replays the item’s life, both ways', async () => {
    await oneFullLife();
    const on = async (date: string) => (await assetOn(db, 'laptop-001', date))?.asset;
    expect(await on('2026-09-14')).toMatchObject({
      status: 'available',
      condition: 'new',
      previous_lives: 0,
    });
    expect(await on('2027-01-01')).toMatchObject({ status: 'leased' });
    expect(await on('2027-09-20')).toMatchObject({ status: 'returned', previous_lives: 1 });
    expect(await on('2027-10-01')).toMatchObject({ status: 'available', condition: 'good' });
    // and back again: nothing was changed by looking
    expect(await on('2026-09-14')).toMatchObject({ status: 'available', condition: 'new' });
  });

  it('shows the second-life price only from the refurbishment on', async () => {
    await oneFullLife();
    expect((await assetOn(db, 'laptop-001', '2027-09-30'))?.secondLifePriceCents).toBeNull();
    expect((await assetOn(db, 'laptop-001', '2027-10-01'))?.secondLifePriceCents).toBe(80_000);
  });

  it('leaves out contracts not signed yet, and undoes endings that came later', async () => {
    await oneFullLife();
    expect(await listContracts(db, null, '2026-09-14')).toEqual([]);
    expect((await listContracts(db, null, '2027-01-01'))[0]?.status).toBe('active');
    expect((await listContracts(db, null, '2027-09-15'))[0]?.status).toBe('returned');
  });

  it('shows other items exactly as they are now', async () => {
    await oneFullLife();
    const items = await assetsOn(db, '2026-09-14');
    expect(items.find((i) => i.asset.id === 'ebike-009')).toMatchObject({
      asset: { status: 'reserved' },
      laterHistory: false,
    });
  });
});

describe('the past can be looked at, not changed', () => {
  it('locks an item that has later history', async () => {
    await oneFullLife();
    expect(await hasLaterHistory(db, 'laptop-001', '2027-01-01')).toBe(true);
    expect(await hasLaterHistory(db, 'laptop-001', '2027-10-01')).toBe(false);
    expect(await hasLaterHistory(db, 'laptop-002', '2026-01-01')).toBe(false);
  });

  it('refuses a new lease of the item in the past, before its recorded history', async () => {
    await oneFullLife();
    expect(
      await submitApplication(
        db,
        { assetId: 'laptop-001', termMonths: 12, downPaymentCents: 0, answers: {} },
        '2026-06-01'
      )
    ).toEqual({ ok: false, reason: 'asset_not_available' });
  });
});
