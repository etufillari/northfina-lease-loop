// Expired holds against a real (test) database: an approval nobody signed must not keep its
// items reserved forever. Card 1's Aino is approved on 5 Nov; her hold lasts to 12 Nov.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import { ainoScript, applyAndSubmit } from '../../tests/helpers/apply-and-submit';
import { createTestDb } from '../../tests/helpers/test-db';
import { startApplication } from './applications';
import { seedAssets } from './assets';
import { listAuditLog } from './audit';
import { signApplication } from './contracts';
import { seedCustomers } from './customers';
import { isHoldExpired, listExpiredHolds, releaseExpiredHolds } from './staff-holds';

describe('isHoldExpired', () => {
  it('a hold includes its last day and is over the day after', () => {
    expect(isHoldExpired('2026-11-12', '2026-11-11')).toBe(false);
    expect(isHoldExpired('2026-11-12', '2026-11-12')).toBe(false);
    expect(isHoldExpired('2026-11-12', '2026-11-13')).toBe(true);
  });

  it('no hold date means nothing to expire', () => {
    expect(isHoldExpired(null, '2030-01-01')).toBe(false);
  });
});

describe('releasing expired holds', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>['db'];
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    ({ db, cleanup } = await createTestDb());
    await seedAssets(db, await loadAssets());
    await seedCustomers(db, await loadCustomers());
  });
  afterAll(async () => {
    await cleanup();
  });

  const APPROVED_ON = '2026-11-05';
  const STAFF = 'staff';
  const aino = (assetId: string) =>
    applyAndSubmit(db, {
      customerId: 'cust-aino',
      assetIds: [assetId],
      downPaymentCents: 0,
      termMonths: 36,
      script: ainoScript,
      asOf: APPROVED_ON,
    });

  let applicationId = '';

  it('keeps the hold through its last day', async () => {
    const state = await aino('ebike-003');
    expect(state.application).toMatchObject({ status: 'approved', holdUntil: '2026-11-12' });
    applicationId = state.application.id;

    expect(await listExpiredHolds(db, '2026-11-12')).toEqual([]);
    expect(await releaseExpiredHolds(db, { actor: STAFF, asOf: '2026-11-12' })).toEqual([]);
    expect((await db.asset.findUnique({ where: { id: 'ebike-003' } }))?.status).toBe('reserved');
  });

  it('lists the hold the day after it ran out', async () => {
    const expired = await listExpiredHolds(db, '2026-11-13');
    expect(expired).toHaveLength(1);
    expect(expired[0]).toMatchObject({
      applicationId,
      status: 'approved',
      customerName: expect.any(String),
      holdUntil: '2026-11-12',
      assets: [{ id: 'ebike-003', name: expect.any(String) }],
    });
  });

  it('releases it: application expired, reservation ended, item available, audited', async () => {
    const released = await releaseExpiredHolds(db, { actor: STAFF, asOf: '2026-11-13' });
    expect(released).toEqual([
      { applicationId, releasedAssetIds: ['ebike-003'], stillHeldAssetIds: [] },
    ]);

    expect((await db.application.findUnique({ where: { id: applicationId } }))?.status).toBe(
      'expired'
    );
    expect(await db.reservation.count({ where: { asset_id: 'ebike-003', active: true } })).toBe(0);
    expect((await db.asset.findUnique({ where: { id: 'ebike-003' } }))?.status).toBe('available');

    const audit = await listAuditLog(db);
    expect(audit[0]).toMatchObject({
      actor: STAFF,
      action: 'application.hold_expired',
      entity_id: applicationId,
      details: { from: 'approved', to: 'expired', holdUntil: '2026-11-12' },
    });
  });

  it('is idempotent, and the expired application can no longer be signed', async () => {
    expect(await releaseExpiredHolds(db, { actor: STAFF, asOf: '2026-11-20' })).toEqual([]);
    const signed = await signApplication(db, {
      applicationId,
      startDate: '2026-11-13',
      actor: 'cust-aino',
      asOf: '2026-11-13',
    });
    expect(signed).toEqual({ ok: false, reason: 'not_signable' });
  });

  it('the released item can be leased by the next customer', async () => {
    const next = await startApplication(db, {
      assetIds: ['ebike-003'],
      downPaymentCents: 0,
      termMonths: 36,
      customerId: 'cust-norvi',
      actor: 'cust-norvi',
      asOf: '2026-11-13',
    });
    expect(next.ok).toBe(true);
  });

  it('a fleet waiting for its signatory releases every item', async () => {
    const fleet = ['ebike-004', 'ebike-005'];
    const state = await applyAndSubmit(db, {
      customerId: 'cust-norvi',
      assetIds: fleet,
      downPaymentCents: 0,
      termMonths: 36,
      asOf: APPROVED_ON,
      script: {
        q_customer_type: 'company',
        q_email: 'fleet@norvi.example.com',
        q_business_id: '3299871-7',
        q_company_name: 'Norvi Logistics Oy',
        q_can_sign: 'no',
        q_signatory_email: 'ceo@norvi.example.com',
        q_vat_registered: 'yes',
        q_usage_purpose: 'delivery',
      },
    });
    expect(state.application.status).toBe('awaiting_signature');

    const released = await releaseExpiredHolds(db, { actor: STAFF, asOf: '2026-11-13' });
    expect(released).toEqual([
      { applicationId: state.application.id, releasedAssetIds: fleet, stillHeldAssetIds: [] },
    ]);
    const assets = await db.asset.findMany({ where: { id: { in: fleet } } });
    expect(assets.every((a) => a.status === 'available')).toBe(true);
  });

  it('an item someone else still holds stays reserved', async () => {
    const state = await aino('ebike-006');
    // A second, still-active hold on the same item (e.g. a waiting-list offer).
    await db.reservation.create({
      data: { asset_id: 'ebike-006', kind: 'waitlist_offer', until: '2026-12-31' },
    });
    const released = await releaseExpiredHolds(db, { actor: STAFF, asOf: '2026-11-13' });
    expect(released).toEqual([
      {
        applicationId: state.application.id,
        releasedAssetIds: [],
        stillHeldAssetIds: ['ebike-006'],
      },
    ]);
    expect((await db.asset.findUnique({ where: { id: 'ebike-006' } }))?.status).toBe('reserved');
    expect((await db.application.findUnique({ where: { id: state.application.id } }))?.status).toBe(
      'expired'
    );
  });

  it('never expires a manual review: the customer is waiting for us', async () => {
    const state = await aino('ebike-012');
    await db.application.update({
      where: { id: state.application.id },
      data: { status: 'manual_review' },
    });
    expect(await releaseExpiredHolds(db, { actor: STAFF, asOf: '2026-12-31' })).toEqual([]);
    expect((await db.application.findUnique({ where: { id: state.application.id } }))?.status).toBe(
      'manual_review'
    );
  });
});
