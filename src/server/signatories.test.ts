// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { forbidden } from '../../tests/helpers/authz';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { resetDb } from '../../tests/helpers/reset-db';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedCustomers } from './customers';
import type { PrismaClient } from './prisma-client';
import {
  addSignatory,
  entryForLink,
  listSignatories,
  revokeSignatory,
  seedSignatories,
} from './signatories';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let customers: Customer[];

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  customers = await loadCustomers();
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(db);
  await seedCustomers(db, customers);
  await seedSignatories(db, customers, TODAY);
});

const TODAY = '2026-11-05';
const cfo = {
  customerId: 'cust-kettukoodi',
  name: 'Kaisa Kettu',
  email: ' Kaisa@Kettukoodi.example.com ',
  validFrom: TODAY,
  validTo: null,
  today: TODAY,
};

describe('seedSignatories (D46)', () => {
  it('every company whose applicant can sign has its own e-mail as signatory; Norvi has none', async () => {
    expect(await listSignatories(db, 'cust-kettukoodi', TODAY)).toMatchObject([
      {
        name: 'Kettu Koodi Oy',
        email: 'it@kettukoodi.example.com',
        grantedBy: 'register_check_simulated',
        validFrom: TODAY,
        validTo: null,
        state: 'active',
      },
    ]);
    expect(await listSignatories(db, 'cust-haapala', TODAY)).toHaveLength(1);
    expect(await listSignatories(db, 'cust-norvi', TODAY)).toEqual([]);
    expect(await listSignatories(db, 'cust-aino', TODAY)).toEqual([]);
  });

  it('is idempotent: a second run adds nothing', async () => {
    const before = await db.companySignatory.count();
    const again = await seedSignatories(db, customers, '2026-12-01');
    expect(again.created).toBe(0);
    expect(again.skipped).toBe(before);
    expect(await db.companySignatory.count()).toBe(before);
  });
});

describe('addSignatory', () => {
  it('the company, itself a signatory, adds one; it is granted by the company’s entry', async () => {
    const [own] = await listSignatories(db, 'cust-kettukoodi', TODAY);
    const result = await addSignatory(db, { ...cfo, actor: 'cust-kettukoodi' });
    expect(result.ok && result.signatory).toMatchObject({
      email: 'kaisa@kettukoodi.example.com',
      grantedBy: own?.id,
      state: 'active',
    });
    const [audit] = await db.auditLog.findMany();
    expect(audit).toMatchObject({ action: 'company_signatory.added', actor: 'cust-kettukoodi' });
  });

  it('the admin adds one as the register check would', async () => {
    const result = await addSignatory(db, { ...cfo, actor: 'admin' });
    expect(result.ok && result.signatory.grantedBy).toBe('register_check_simulated');
  });

  it('the trap: a stranger, anonymous or Norvi’s coordinator who may not sign is refused', async () => {
    expect(await addSignatory(db, { ...cfo, actor: 'cust-aino' })).toEqual(
      forbidden('not_owner', 'manage_signatories')
    );
    expect(await addSignatory(db, { ...cfo, actor: 'anonymous' })).toEqual(
      forbidden('not_signed_in', 'manage_signatories')
    );
    expect(
      await addSignatory(db, {
        ...cfo,
        customerId: 'cust-norvi',
        email: 'friend@norvi.example.com',
        actor: 'cust-norvi',
      })
    ).toEqual(forbidden('signatory_required', 'manage_signatories'));
    expect(await db.auditLog.count()).toBe(0);
  });

  it('a consumer has no signatory list; the same e-mail twice is already listed', async () => {
    expect(await addSignatory(db, { ...cfo, customerId: 'cust-aino', actor: 'admin' })).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(
      await addSignatory(db, { ...cfo, email: 'IT@kettukoodi.example.com', actor: 'admin' })
    ).toEqual({ ok: false, reason: 'already_listed' });
  });

  it('an end on or before the start is refused', async () => {
    expect(await addSignatory(db, { ...cfo, validTo: TODAY, actor: 'admin' })).toEqual({
      ok: false,
      reason: 'invalid_dates',
    });
  });
});

describe('entryForLink (wave 3 finding 3)', () => {
  it('a revoked and re-added e-mail gets its link on the new entry, not the ended one', async () => {
    const first = await addSignatory(db, { ...cfo, actor: 'admin' });
    if (!first.ok) throw new Error('setup');
    const revoked = await revokeSignatory(db, {
      customerId: 'cust-kettukoodi',
      signatoryId: first.signatory.id,
      actor: 'admin',
      today: '2026-11-10',
    });
    expect(revoked.ok).toBe(true);
    const again = await addSignatory(db, {
      ...cfo,
      validFrom: '2026-11-12',
      today: '2026-11-12',
      actor: 'admin',
    });
    if (!again.ok) throw new Error('setup');
    const rows = await db.companySignatory.findMany({ orderBy: { created_at: 'asc' } });
    const email = 'kaisa@kettukoodi.example.com';
    expect(entryForLink(rows, email, '2026-11-12')?.id).toBe(again.signatory.id);
    // Only the ended entry: the link still names it, and signing answers signatory_not_active.
    const ended = rows.filter((row) => row.id !== again.signatory.id);
    expect(entryForLink(ended, email, '2026-11-12')?.id).toBe(first.signatory.id);
    expect(entryForLink(rows, 'nobody@kettukoodi.example.com', '2026-11-12')).toBeUndefined();
  });
});

describe('revokeSignatory', () => {
  it('ends the right on the day, with an audit row', async () => {
    const added = await addSignatory(db, { ...cfo, actor: 'cust-kettukoodi' });
    if (!added.ok) throw new Error('setup');
    const result = await revokeSignatory(db, {
      customerId: 'cust-kettukoodi',
      signatoryId: added.signatory.id,
      actor: 'cust-kettukoodi',
      today: '2026-11-10',
    });
    expect(result.ok && result.signatory).toMatchObject({ validTo: '2026-11-10', state: 'ended' });
    expect(await db.auditLog.count({ where: { action: 'company_signatory.revoked' } })).toBe(1);
  });

  it('the trap: the last active signatory cannot be revoked', async () => {
    const [own] = await listSignatories(db, 'cust-kettukoodi', TODAY);
    expect(
      await revokeSignatory(db, {
        customerId: 'cust-kettukoodi',
        signatoryId: own!.id,
        actor: 'admin',
        today: TODAY,
      })
    ).toEqual({ ok: false, reason: 'last_signatory' });
  });

  it('another company’s entry is not found through this company; a stranger may not revoke', async () => {
    const [own] = await listSignatories(db, 'cust-kettukoodi', TODAY);
    expect(
      await revokeSignatory(db, {
        customerId: 'cust-haapala',
        signatoryId: own!.id,
        actor: 'admin',
        today: TODAY,
      })
    ).toEqual({ ok: false, reason: 'not_found' });
    expect(
      await revokeSignatory(db, {
        customerId: 'cust-kettukoodi',
        signatoryId: own!.id,
        actor: 'cust-aino',
        today: TODAY,
      })
    ).toEqual(forbidden('not_owner', 'manage_signatories'));
  });
});
