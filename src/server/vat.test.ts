// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { vatPercentOn } from '@/domain/vat';
import { createTestDb } from '../../tests/helpers/test-db';
import type { PrismaClient } from './prisma-client';
import { addVatChange, effectiveVatRates, listVatChanges, removeVatChange } from './vat';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.vatChange.deleteMany();
  await db.auditLog.deleteMany();
});

const TODAY = '2026-11-06';

describe('addVatChange', () => {
  it('adds a future rate that every VAT lookup then uses, with an audit row', async () => {
    const result = await addVatChange(
      db,
      { validFrom: '2027-07-01', ratePercent: 27, actor: 'staff' },
      TODAY
    );
    expect(result).toMatchObject({
      ok: true,
      change: { validFrom: '2027-07-01', ratePercent: 27 },
    });

    const rates = await effectiveVatRates(db);
    expect(vatPercentOn(rates, '2027-06-30')).toBe(26);
    expect(vatPercentOn(rates, '2027-07-01')).toBe(27);
    expect(await db.auditLog.count({ where: { action: 'vat.change_added' } })).toBe(1);
  });

  it('replaces the rate when a change for the same date is added again', async () => {
    await addVatChange(db, { validFrom: '2027-07-01', ratePercent: 27, actor: 'staff' }, TODAY);
    await addVatChange(db, { validFrom: '2027-07-01', ratePercent: 24.5, actor: 'staff' }, TODAY);
    expect(await listVatChanges(db)).toEqual([
      expect.objectContaining({ validFrom: '2027-07-01', ratePercent: 24.5 }),
    ]);
  });

  it('refuses a change that would start today or earlier', async () => {
    for (const validFrom of [TODAY, '2026-01-01']) {
      expect(await addVatChange(db, { validFrom, ratePercent: 27, actor: 'staff' }, TODAY)).toEqual(
        { ok: false, reason: 'not_in_future' }
      );
    }
  });

  it('refuses rates outside 0–100 % or with more than two decimals', async () => {
    for (const ratePercent of [-1, 100.01, 25.555, Number.NaN]) {
      expect(
        await addVatChange(db, { validFrom: '2027-07-01', ratePercent, actor: 'staff' }, TODAY)
      ).toEqual({ ok: false, reason: 'invalid_rate' });
    }
    expect(
      await addVatChange(db, { validFrom: '2027-07-01', ratePercent: 0, actor: 'staff' }, TODAY)
    ).toMatchObject({ ok: true });
  });
});

describe('removeVatChange', () => {
  it('removes a change that hasn’t started, and the data pack rate applies again', async () => {
    const added = await addVatChange(
      db,
      { validFrom: '2027-07-01', ratePercent: 27, actor: 'staff' },
      TODAY
    );
    if (!added.ok) throw new Error(added.reason);
    expect(await removeVatChange(db, { id: added.change.id, actor: 'staff' }, TODAY)).toEqual({
      ok: true,
    });
    expect(vatPercentOn(await effectiveVatRates(db), '2027-07-01')).toBe(26);
    expect(await db.auditLog.count({ where: { action: 'vat.change_removed' } })).toBe(1);
  });

  it('refuses to remove a change that is already in force', async () => {
    const added = await addVatChange(
      db,
      { validFrom: '2027-07-01', ratePercent: 27, actor: 'staff' },
      TODAY
    );
    if (!added.ok) throw new Error(added.reason);
    expect(
      await removeVatChange(db, { id: added.change.id, actor: 'staff' }, '2027-07-01')
    ).toEqual({ ok: false, reason: 'already_in_force' });
  });

  it('refuses an unknown change', async () => {
    expect(await removeVatChange(db, { id: 999, actor: 'staff' }, TODAY)).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });
});
