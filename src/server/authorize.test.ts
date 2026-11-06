// D73, D74: `authorize` against a real, migrated SQLite database (see tests/global-setup.ts):
// it resolves the owner through the owning slice's read, refuses anonymous before reading and
// answers `not_found` for an unknown record; `forbiddenResponse` is 401 or 403 FORBIDDEN.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedPack } from '../../tests/helpers/invoice-fixture';
import { quoteAndApply, signedContract } from '../../tests/helpers/journey';
import { refusal } from '../../tests/helpers/authz';
import { createTestDb } from '../../tests/helpers/test-db';
import { authorize, forbiddenResponse, refusalResponse } from './authorize';
import { listInvoices } from './invoices';
import type { PrismaClient } from './prisma-client';

const TODAY = '2026-11-05';
let db: PrismaClient;
let cleanup: () => Promise<void>;
let ids: { application: string; contract: string; invoice: string; norvi: string };

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  await seedPack(db);
  const trip = { customerId: 'cust-aino', assetId: 'ebike-003', termMonths: 36, quoteOn: TODAY };
  const signed = await signedContract(db, trip);
  const [invoice] = await listInvoices(db, signed.contract.id);
  const norvi = await quoteAndApply(db, {
    customerId: 'cust-norvi',
    assetId: 'ebike-004',
    termMonths: 36,
    quoteOn: TODAY,
  });
  ids = {
    application: signed.application.id,
    contract: signed.contract.id,
    invoice: invoice!.id,
    norvi: norvi.application.id,
  };
});
afterAll(async () => {
  await cleanup();
});

describe('authorize', () => {
  it('answers the owner of an application, a contract and an invoice', async () => {
    for (const ref of [
      { application: ids.application },
      { contract: ids.contract },
      { invoice: ids.invoice },
    ]) {
      expect(await authorize(db, 'cust-aino', 'read_contract', ref)).toEqual({
        ok: true,
        ownerId: 'cust-aino',
      });
    }
    expect(await authorize(db, 'admin', 'assess_asset', { none: true })).toEqual({
      ok: true,
      ownerId: null,
    });
  });

  it('refuses another customer as not_owner', async () => {
    expect(await authorize(db, 'cust-mikko', 'pay_invoice', { invoice: ids.invoice })).toEqual({
      ok: false,
      reason: refusal('not_owner', 'pay_invoice'),
    });
  });

  it('refuses anonymous before reading, so an unknown id answers the same', async () => {
    const known = await authorize(db, 'anonymous', 'read_contract', { contract: ids.contract });
    const unknown = await authorize(db, 'anonymous', 'read_contract', { contract: 'nope' });
    expect(known).toEqual({ ok: false, reason: refusal('not_signed_in', 'read_contract') });
    expect(unknown).toEqual(known);
  });

  it('answers not_found for an unknown record or customer', async () => {
    expect(await authorize(db, 'admin', 'read_contract', { contract: 'nope' })).toEqual({
      ok: false,
      reason: { code: 'not_found', params: {} },
    });
    expect(await authorize(db, 'admin', 'apply', { customer: 'cust-nobody' })).toMatchObject({
      reason: { code: 'not_found' },
    });
  });

  it('card 6: Norvi’s case awaiting the signatory is signed by neither the coordinator nor the admin', async () => {
    for (const actor of ['cust-norvi', 'admin']) {
      expect(await authorize(db, actor, 'sign_contract', { application: ids.norvi })).toEqual({
        ok: false,
        reason: refusal('signatory_required', 'sign_contract'),
      });
    }
    expect(
      await authorize(db, 'cust-norvi', 'read_application', { application: ids.norvi })
    ).toEqual({ ok: true, ownerId: 'cust-norvi' });
  });

  it('lets every visitor run a demo card (gated by DEMO_TOOLS instead)', async () => {
    expect(await authorize(db, 'anonymous', 'run_demo_card', { none: true })).toEqual({
      ok: true,
      ownerId: null,
    });
  });
});

describe('forbiddenResponse and refusalResponse (D74)', () => {
  it('not_signed_in is 401, every other refusal 403, both FORBIDDEN with the reason', async () => {
    const unauthenticated = forbiddenResponse(refusal('not_signed_in', 'apply'));
    expect(unauthenticated.status).toBe(401);
    expect((await unauthenticated.json()).error).toMatchObject({
      code: 'FORBIDDEN',
      details: { code: 'not_signed_in', params: { action: 'apply' } },
    });
    for (const code of ['not_owner', 'admin_only', 'signatory_required'] as const) {
      const response = forbiddenResponse(refusal(code, 'apply'));
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('FORBIDDEN');
    }
  });

  it('not_found goes to the route’s own 404', async () => {
    const response = refusalResponse({ code: 'not_found', params: {} }, () =>
      Response.json({}, { status: 404 })
    );
    expect(response.status).toBe(404);
  });
});
