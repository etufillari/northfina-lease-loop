// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { submitApplication } from './applications';
import { assetOn } from './asset-state';
import { seedAssets } from './assets';
import { signContract } from './contracts';
import { passOnContract, respondToHandover } from './end-of-term';
import { listHoldRequests, releaseHold, requestHold } from './holds';
import { notificationsFor } from './notifications';
import type { PrismaClient } from './prisma-client';
import { refurbishItem, type RefurbishInput } from './second-life';

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
    'holdRequest',
    'handover',
    'refurbishment',
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

const ASKED = '2026-11-06';
const REFURBISHED = '2026-11-10';
const LET_GO = '2026-11-15';

// ebike-007 is back in the data pack, waiting for its check (scenario card 9)
const lenaAsks = (overrides: Partial<Parameters<typeof requestHold>[1]> = {}) =>
  requestHold(
    db,
    {
      assetId: 'ebike-007',
      customerId: 'cust-lena',
      termMonths: 24,
      maxMonthlyCents: 9_000,
      minCondition: 'good',
      actor: 'Lena Tamm',
      ...overrides,
    },
    ASKED
  );

const refurbish = (holdRequestId: string | null): RefurbishInput => ({
  assetId: 'ebike-007',
  conditionFound: 'fair',
  usageFound: 18_400,
  conditionAfter: 'good',
  presetIds: [],
  customRepairs: [],
  priceCents: 172_700,
  notes: null,
  actor: 'admin',
  holdRequestId,
});

describe('requestHold', () => {
  it('records a request with its requirements, once per customer and item', async () => {
    const result = await lenaAsks();
    expect(result).toMatchObject({
      ok: true,
      request: { assetId: 'ebike-007', customerId: 'cust-lena', status: 'waiting' },
    });
    expect(await lenaAsks()).toEqual({ ok: false, reason: 'already_requested' });
    expect(await db.auditLog.count({ where: { action: 'hold.requested' } })).toBe(1);
  });

  it('works for a leased item too', async () => {
    const application = await submitApplication(
      db,
      {
        assetId: 'laptop-004',
        termMonths: 36,
        downPaymentCents: 0,
        customerId: 'cust-aino',
        answers: {
          q_customer_type: 'consumer',
          q_full_name: 'Aino Virtanen',
          q_birth_date: '1997-04-12',
          q_email: 'aino@example.com',
          q_country: 'FI',
          q_employment: 'employed',
          q_monthly_income: '3200',
        },
      },
      '2026-11-05'
    );
    if (!application.ok) throw new Error(application.reason);
    await signContract(
      db,
      { applicationId: application.application.id, signerName: 'Aino Virtanen' },
      '2026-11-05'
    );
    expect(await lenaAsks({ assetId: 'laptop-004' })).toMatchObject({ ok: true });
  });

  it('refuses a free item, bad requirements and an unknown item', async () => {
    expect(await lenaAsks({ assetId: 'ebike-003' })).toEqual({ ok: false, reason: 'not_holdable' });
    expect(await lenaAsks({ termMonths: 18 })).toEqual({ ok: false, reason: 'unknown_term' });
    expect(await lenaAsks({ maxMonthlyCents: 0 })).toEqual({ ok: false, reason: 'invalid_budget' });
    expect(await lenaAsks({ minCondition: 'shiny' })).toEqual({
      ok: false,
      reason: 'unknown_condition',
    });
    expect(await lenaAsks({ assetId: 'nope' })).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('holding at refurbishment, and changing your mind', () => {
  it('staff hold it for the customer who asked; they can let it go later', async () => {
    const asked = await lenaAsks();
    if (!asked.ok) throw new Error(asked.reason);
    expect(await refurbishItem(db, refurbish(asked.request.id), REFURBISHED)).toMatchObject({
      ok: true,
      status: 'reserved',
    });
    expect(await db.asset.findUniqueOrThrow({ where: { id: 'ebike-007' } })).toMatchObject({
      status: 'reserved',
      reserved_for: 'cust-lena',
    });
    expect(await listHoldRequests(db, { assetId: 'ebike-007' }, REFURBISHED)).toEqual([
      expect.objectContaining({ status: 'held' }),
    ]);
    const viewer = { kind: 'customer' as const, customer: { id: 'cust-lena' } as never };
    expect((await notificationsFor(db, viewer, REFURBISHED)).readyForYou).toEqual(['ebike-007']);

    expect(
      await releaseHold(
        db,
        { assetId: 'ebike-007', customerId: 'cust-lena', actor: 'Lena' },
        LET_GO
      )
    ).toEqual({ ok: true, released: 'hold' });
    expect(await db.asset.findUniqueOrThrow({ where: { id: 'ebike-007' } })).toMatchObject({
      status: 'available',
      reserved_for: null,
    });
    expect((await notificationsFor(db, viewer, LET_GO)).readyForYou).toEqual([]);
    expect(await listHoldRequests(db, { assetId: 'ebike-007' }, LET_GO)).toEqual([]);

    // Time travel replays it: held between the refurbishment and letting go
    expect(await assetOn(db, 'ebike-007', '2026-11-12')).toMatchObject({
      asset: { status: 'reserved' },
      reservedFor: 'cust-lena',
      laterHistory: true,
    });
    expect(await assetOn(db, 'ebike-007', LET_GO)).toMatchObject({
      asset: { status: 'available' },
      reservedFor: null,
    });
    // ...and nothing can be changed in the past
    expect(
      await releaseHold(
        db,
        { assetId: 'ebike-007', customerId: 'cust-lena', actor: 'Lena' },
        '2026-11-12'
      )
    ).toEqual({ ok: false, reason: 'later_history' });
  });

  it('withdraws a request that is still waiting; then staff can’t hold it for them', async () => {
    const asked = await lenaAsks();
    if (!asked.ok) throw new Error(asked.reason);
    expect(
      await releaseHold(db, { assetId: 'ebike-007', customerId: 'cust-lena', actor: 'Lena' }, ASKED)
    ).toEqual({ ok: true, released: 'request' });
    expect(await refurbishItem(db, refurbish(asked.request.id), REFURBISHED)).toEqual({
      ok: false,
      reason: 'invalid_hold',
    });
    expect(
      await releaseHold(db, { assetId: 'ebike-007', customerId: 'cust-lena', actor: 'Lena' }, ASKED)
    ).toEqual({ ok: false, reason: 'nothing_to_release' });
  });

  it('a pass-on recipient who accepted can change their mind; the item is free again', async () => {
    // ebike-007 came back; a lease of laptop-001 is passed on to Lena instead
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
    // Pay every invoice so the lease can end, then pass it on after its last day
    for (let n = 2; n <= 12; n++) {
      await db.invoicePayment.create({
        data: {
          contract_id: signed.contract.id,
          invoice_number: n,
          paid_date: '2027-11-01',
          amount_cents: 0,
        },
      });
    }
    const passed = await passOnContract(
      db,
      { contractId: signed.contract.id, toCustomerId: 'cust-lena', actor: 'Aino' },
      '2027-11-05'
    );
    if (!passed.ok) throw new Error(passed.reason);
    await respondToHandover(
      db,
      { handoverId: passed.handoverId, accept: true, customerId: 'cust-lena', actor: 'Lena' },
      '2027-11-05'
    );
    expect(
      await releaseHold(
        db,
        { assetId: 'laptop-001', customerId: 'cust-lena', actor: 'Lena' },
        '2027-11-06'
      )
    ).toEqual({ ok: true, released: 'hold' });
    expect(await db.asset.findUniqueOrThrow({ where: { id: 'laptop-001' } })).toMatchObject({
      status: 'returned', // still waiting for its check, now for anyone
      reserved_for: null,
    });
    expect(await assetOn(db, 'laptop-001', '2027-11-06')).toMatchObject({ reservedFor: null });
  });

  it('can’t hold an item for a requester when a pass-on recipient already holds it', async () => {
    const asked = await lenaAsks();
    if (!asked.ok) throw new Error(asked.reason);
    await db.asset.update({ where: { id: 'ebike-007' }, data: { reserved_for: 'cust-aino' } });
    expect(await refurbishItem(db, refurbish(asked.request.id), REFURBISHED)).toEqual({
      ok: false,
      reason: 'already_held',
    });
  });
});
