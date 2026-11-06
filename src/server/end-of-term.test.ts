// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { submitApplication } from './applications';
import { seedAssets } from './assets';
import { getContract, signContract } from './contracts';
import {
  buyContract,
  handoverForContract,
  passOnContract,
  pendingHandovers,
  respondToHandover,
  returnContract,
} from './end-of-term';
import { payInvoice } from './invoices';
import { notificationsFor } from './notifications';
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
  await db.handover.deleteMany();
  await db.invoicePayment.deleteMany();
  await db.contract.deleteMany();
  await db.application.deleteMany();
  await db.auditLog.deleteMany();
  await db.vatChange.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

const AFTER_END = '2027-11-05'; // a 12-month lease from 5 Nov 2026 ends on 4 Nov 2027

/** Aino leases laptop-001 for 12 months from 5 Nov 2026. */
async function ainosLease() {
  const application = await submitApplication(
    db,
    {
      assetId: 'laptop-001',
      termMonths: 12,
      downPaymentCents: 0,
      customerId: 'cust-aino',
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

/** A lease that has ended with every invoice paid, so its end can be decided. */
async function settledLease() {
  const contract = await ainosLease();
  await payAll(contract.id);
  return contract;
}

async function payAll(contractId: string) {
  for (let invoiceNumber = 2; invoiceNumber <= 12; invoiceNumber++) {
    await payInvoice(db, { contractId, invoiceNumber, actor: 'Aino' }, AFTER_END);
  }
}

const asset = () => db.asset.findUniqueOrThrow({ where: { id: 'laptop-001' } });

describe('buyContract', () => {
  it('sells the item at the buyout plus today’s VAT once every invoice is paid', async () => {
    const contract = await ainosLease();
    await payAll(contract.id);
    // 40 % buyout after 12 months: 47960 net; 26 % VAT in 2027 → 12470 → 60430
    expect(await buyContract(db, { contractId: contract.id, actor: 'Aino' }, AFTER_END)).toEqual({
      ok: true,
      paidCents: 60_430,
    });
    expect(await getContract(db, contract.id)).toMatchObject({
      status: 'bought',
      boughtDate: AFTER_END,
    });
    expect(await asset()).toMatchObject({ status: 'sold', previous_lives: 1 });
    expect(await db.auditLog.count({ where: { action: 'contract.bought' } })).toBe(1);
  });

  it('asks for the open invoices to be paid first', async () => {
    const contract = await ainosLease();
    expect(await buyContract(db, { contractId: contract.id, actor: 'Aino' }, AFTER_END)).toEqual({
      ok: false,
      reason: 'unpaid_invoices',
    });
  });

  it('refuses before the lease has ended, and after another choice was made', async () => {
    const contract = await ainosLease();
    await payAll(contract.id);
    expect(await buyContract(db, { contractId: contract.id, actor: 'Aino' }, '2027-11-04')).toEqual(
      { ok: false, reason: 'not_ended' }
    );
    await returnContract(db, { contractId: contract.id, actor: 'Aino' }, AFTER_END);
    expect(await buyContract(db, { contractId: contract.id, actor: 'Aino' }, AFTER_END)).toEqual({
      ok: false,
      reason: 'already_decided',
    });
  });
});

describe('passOnContract and respondToHandover', () => {
  it('passes the item on: it comes back for a check and the recipient is asked', async () => {
    const contract = await settledLease();
    const result = await passOnContract(
      db,
      { contractId: contract.id, toCustomerId: 'cust-lena', actor: 'Aino' },
      AFTER_END
    );
    expect(result).toMatchObject({ ok: true });
    expect(await getContract(db, contract.id)).toMatchObject({ status: 'passed_on' });
    expect(await asset()).toMatchObject({ status: 'returned', previous_lives: 1 });
    expect(await pendingHandovers(db, 'cust-lena', AFTER_END)).toEqual([
      expect.objectContaining({ fromName: 'Aino Virtanen', assetId: 'laptop-001' }),
    ]);
    expect(await pendingHandovers(db, 'cust-mikko', AFTER_END)).toEqual([]);
    // A returned contract can't be returned again either
    expect(await returnContract(db, { contractId: contract.id, actor: 'Aino' }, AFTER_END)).toEqual(
      { ok: false, reason: 'already_decided' }
    );
  });

  it('reserves the item for the recipient when they accept', async () => {
    const contract = await settledLease();
    const passed = await passOnContract(
      db,
      { contractId: contract.id, toCustomerId: 'cust-lena', actor: 'Aino' },
      AFTER_END
    );
    if (!passed.ok) throw new Error(passed.reason);
    expect(
      await respondToHandover(
        db,
        { handoverId: passed.handoverId, accept: true, customerId: 'cust-lena', actor: 'Lena' },
        AFTER_END
      )
    ).toEqual({ ok: true, status: 'accepted' });
    // Held for Lena while it waits for its check; reserved for her once refurbished
    expect(await asset()).toMatchObject({ status: 'returned', reserved_for: 'cust-lena' });
    expect(await handoverForContract(db, contract.id)).toMatchObject({ status: 'accepted' });
  });

  it('leaves the item returned when the recipient declines', async () => {
    const contract = await settledLease();
    const passed = await passOnContract(
      db,
      { contractId: contract.id, toCustomerId: 'cust-lena', actor: 'Aino' },
      AFTER_END
    );
    if (!passed.ok) throw new Error(passed.reason);
    await respondToHandover(
      db,
      { handoverId: passed.handoverId, accept: false, customerId: 'cust-lena', actor: 'Lena' },
      AFTER_END
    );
    expect(await asset()).toMatchObject({ status: 'returned' });
    expect(
      await respondToHandover(
        db,
        { handoverId: passed.handoverId, accept: true, customerId: 'cust-lena', actor: 'Lena' },
        AFTER_END
      )
    ).toEqual({ ok: false, reason: 'already_decided' });
  });

  it('only lets the recipient answer', async () => {
    const contract = await settledLease();
    const passed = await passOnContract(
      db,
      { contractId: contract.id, toCustomerId: 'cust-lena', actor: 'Aino' },
      AFTER_END
    );
    if (!passed.ok) throw new Error(passed.reason);
    expect(
      await respondToHandover(
        db,
        { handoverId: passed.handoverId, accept: true, customerId: 'cust-mikko', actor: 'Mikko' },
        AFTER_END
      )
    ).toEqual({ ok: false, reason: 'not_yours' });
  });

  it('refuses passing on to yourself or to someone unknown', async () => {
    const contract = await settledLease();
    for (const toCustomerId of ['cust-aino', 'cust-nobody']) {
      expect(
        await passOnContract(
          db,
          { contractId: contract.id, toCustomerId, actor: 'Aino' },
          AFTER_END
        )
      ).toEqual({ ok: false, reason: 'invalid_recipient' });
    }
  });
});

describe('notificationsFor', () => {
  const aino = { kind: 'customer' as const, customer: { id: 'cust-aino' } as never };
  const lena = { kind: 'customer' as const, customer: { id: 'cust-lena' } as never };

  it('tells the lessee the lease has ended, and the recipient about a pass-on', async () => {
    const contract = await ainosLease();
    await payAll(contract.id);

    const atEnd = await notificationsFor(db, aino, AFTER_END);
    expect(atEnd.endedLeases.map((c) => c.id)).toEqual([contract.id]);
    expect(atEnd).toMatchObject({ count: 1, dueInvoices: [] });

    await passOnContract(
      db,
      { contractId: contract.id, toCustomerId: 'cust-lena', actor: 'Aino' },
      AFTER_END
    );
    expect((await notificationsFor(db, aino, AFTER_END)).count).toBe(0);
    const forLena = await notificationsFor(db, lena, AFTER_END);
    expect(forLena.handovers).toHaveLength(1);
    expect(forLena.count).toBe(1);
  });

  it('counts unpaid invoices while the lease runs', async () => {
    await ainosLease();
    const notifications = await notificationsFor(db, aino, '2027-01-10');
    expect(notifications).toMatchObject({ endedLeases: [], handovers: [], count: 2 });
  });
});

describe('ending a lease needs it settled, and pass-ons follow the app date', () => {
  it('refuses to return or pass on while invoices are unpaid', async () => {
    const contract = await ainosLease();
    expect(await returnContract(db, { contractId: contract.id, actor: 'Aino' }, AFTER_END)).toEqual(
      {
        ok: false,
        reason: 'unpaid_invoices',
      }
    );
    expect(
      await passOnContract(
        db,
        { contractId: contract.id, toCustomerId: 'cust-lena', actor: 'Aino' },
        AFTER_END
      )
    ).toEqual({ ok: false, reason: 'unpaid_invoices' });
    expect(await asset()).toMatchObject({ status: 'leased' });
  });

  it('hides a pass-on, and refuses an answer, before the day it was made', async () => {
    const contract = await settledLease();
    const passed = await passOnContract(
      db,
      { contractId: contract.id, toCustomerId: 'cust-lena', actor: 'Aino' },
      AFTER_END
    );
    if (!passed.ok) throw new Error(passed.reason);
    const before = '2027-01-01';
    expect(await pendingHandovers(db, 'cust-lena', before)).toEqual([]);
    expect(
      await respondToHandover(
        db,
        { handoverId: passed.handoverId, accept: false, customerId: 'cust-lena', actor: 'Lena' },
        before
      )
    ).toEqual({ ok: false, reason: 'not_yet' });
  });
});
