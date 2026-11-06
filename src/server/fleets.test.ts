// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import { prefillAnswers } from '@/domain/prefill';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import { getFleet, signFleet, submitFleetApplication } from './fleets';
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
  for (const table of ['contract', 'application', 'auditLog', 'asset'] as const) {
    await (db[table] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await seedAssets(db, await loadAssets());
});

const TODAY = '2026-11-05';
const LAPTOPS = ['laptop-001', 'laptop-002', 'laptop-003', 'laptop-004'];

async function norvi(canSign: 'yes' | 'no') {
  const customer = (await loadCustomers()).find((c) => c.id === 'cust-norvi');
  if (!customer) throw new Error('missing');
  return {
    ...prefillAnswers(customer),
    q_can_sign: canSign,
    q_signatory_email: 'ceo@norvi.example.com',
    q_usage_purpose: 'business',
  };
}

describe('fleets', () => {
  it('applies for four laptops as one deal and signs them all at once', async () => {
    const applied = await submitFleetApplication(
      db,
      { assetIds: LAPTOPS, termMonths: 36, answers: await norvi('yes'), customerId: 'cust-norvi' },
      TODAY
    );
    if (!applied.ok) throw new Error(applied.reason);
    expect(applied.decision).toBe('approved');
    expect(applied.applicationIds).toHaveLength(4);
    expect(await db.auditLog.count({ where: { action: 'fleet.applied' } })).toBe(1);

    const signed = await signFleet(
      db,
      { fleetId: applied.fleetId, signerName: 'Norvi CEO' },
      TODAY
    );
    expect(signed).toMatchObject({ ok: true });
    const fleet = await getFleet(db, applied.fleetId);
    expect(fleet?.contracts.map((c) => c.assetId)).toEqual(LAPTOPS);
    expect(fleet?.totals.count).toBe(4);
    expect(fleet?.totals.monthlyNetCents).toBe(
      fleet?.contracts.reduce((cents, c) => cents + c.monthlyNetCents, 0)
    );
    expect(await db.asset.count({ where: { id: { in: LAPTOPS }, status: 'leased' } })).toBe(4);
    expect(await signFleet(db, { fleetId: applied.fleetId, signerName: 'x' }, TODAY)).toMatchObject(
      { ok: false, reason: 'already_signed' }
    );
  });

  it('card 6: an applicant who may not sign sends the fleet to a person', async () => {
    const applied = await submitFleetApplication(
      db,
      {
        assetIds: ['ebike-004', 'ebike-003'],
        termMonths: 24,
        answers: await norvi('no'),
        customerId: 'cust-norvi',
      },
      TODAY
    );
    if (!applied.ok) throw new Error(applied.reason);
    expect(applied.decision).toBe('manual_review');
    const fleet = await getFleet(db, applied.fleetId);
    expect(fleet?.reasons).toContain('signatory_authorization');
    expect(await signFleet(db, { fleetId: applied.fleetId, signerName: 'x' }, TODAY)).toMatchObject(
      { ok: false, reason: 'not_approved' }
    );
  });

  it('a sole trader signs a fleet with the full name given in the application', async () => {
    const pekka = (await loadCustomers()).find((c) => c.id === 'cust-pekka');
    if (!pekka) throw new Error('missing');
    const applied = await submitFleetApplication(
      db,
      {
        assetIds: ['laptop-001', 'laptop-002'],
        termMonths: 36,
        answers: { ...prefillAnswers(pekka), q_usage_purpose: 'business' },
        customerId: 'cust-pekka',
      },
      TODAY
    );
    if (!applied.ok) throw new Error(applied.reason);
    expect(applied.decision).toBe('approved');
    expect(
      await signFleet(db, { fleetId: applied.fleetId, signerName: 'Norvi CEO' }, TODAY)
    ).toMatchObject({ ok: false, reason: 'name_mismatch' });
    expect(await db.contract.count()).toBe(0);
    expect(
      await signFleet(db, { fleetId: applied.fleetId, signerName: 'Pekka Korhonen' }, TODAY)
    ).toMatchObject({ ok: true });
  });

  it('signs nothing when one item was taken in the meantime', async () => {
    const applied = await submitFleetApplication(
      db,
      { assetIds: LAPTOPS, termMonths: 36, answers: await norvi('yes'), customerId: 'cust-norvi' },
      TODAY
    );
    if (!applied.ok) throw new Error(applied.reason);
    await db.asset.update({ where: { id: 'laptop-003' }, data: { status: 'leased' } });
    expect(
      await signFleet(db, { fleetId: applied.fleetId, signerName: 'Norvi CEO' }, TODAY)
    ).toEqual({ ok: false, reason: 'asset_not_available' });
    expect(await db.contract.count()).toBe(0);
    expect(await db.asset.count({ where: { status: 'leased' } })).toBe(1);
  });

  it('refuses private persons, mixed categories and unavailable items', async () => {
    const answers = await norvi('yes');
    const submit = (assetIds: string[], extra: Record<string, string> = {}) =>
      submitFleetApplication(
        db,
        { assetIds, termMonths: 36, answers: { ...answers, ...extra }, customerId: null },
        TODAY
      );
    expect(await submit(LAPTOPS, { q_customer_type: 'consumer' })).toEqual({
      ok: false,
      reason: 'business_only',
    });
    expect(await submit(['laptop-001', 'ebike-003'])).toEqual({
      ok: false,
      reason: 'mixed_categories',
    });
    expect(await submit(['laptop-001', 'laptop-006'])).toEqual({
      ok: false,
      reason: 'asset_not_available',
      assetId: 'laptop-006',
    });
  });
});
