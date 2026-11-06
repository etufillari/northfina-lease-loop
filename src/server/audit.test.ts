// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { customerAddress } from '@/domain/notifications';
import { listAuditLog, withAudit, type AuditEntry } from './audit';
import { subscribe } from './notifications/bus';
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
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await db.asset.create({
    data: {
      id: 'ebike-001',
      category: 'e_bike',
      make: 'Kettu Bikes',
      model: 'Urban 1',
      model_year: 2026,
      serial_number: 'LL-EB-240000',
      condition: 'new',
      usage_unit: 'km',
      usage_value: 0,
      previous_lives: 0,
      status: 'available',
    },
  });
});

const entry: AuditEntry = {
  actor: 'team-test',
  action: 'asset.status_changed',
  entityType: 'asset',
  entityId: 'ebike-001',
  details: { from: 'available', to: 'reserved' },
};

const reserve = (tx: Parameters<Parameters<typeof withAudit>[2]>[0]) =>
  tx.asset.update({ where: { id: 'ebike-001' }, data: { status: 'reserved' } });

async function currentStatus() {
  return (await db.asset.findUniqueOrThrow({ where: { id: 'ebike-001' } })).status;
}

describe('withAudit', () => {
  it('commits the change and the audit row together', async () => {
    const updated = await withAudit(db, entry, reserve);

    expect(updated.status).toBe('reserved');
    expect(await currentStatus()).toBe('reserved');
    const rows = await db.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor: 'team-test',
      action: 'asset.status_changed',
      entity_type: 'asset',
      entity_id: 'ebike-001',
      details_json: '{"from":"available","to":"reserved"}',
    });
  });

  it('stores no details as null', async () => {
    await withAudit(db, { ...entry, details: undefined }, reserve);
    expect((await db.auditLog.findFirstOrThrow()).details_json).toBeNull();
  });

  it('rolls back the change when the audit write fails', async () => {
    // A missing actor makes the AuditLog insert fail inside the transaction.
    const broken = { ...entry, actor: undefined as unknown as string };

    await expect(withAudit(db, broken, reserve)).rejects.toThrow();

    expect(await currentStatus()).toBe('available');
    expect(await db.auditLog.count()).toBe(0);
  });

  it('writes no audit row when the change itself fails', async () => {
    await expect(
      withAudit(db, entry, async (tx) => {
        await reserve(tx);
        throw new Error('business rule broken after the write');
      })
    ).rejects.toThrow('business rule broken');

    expect(await currentStatus()).toBe('available');
    expect(await db.auditLog.count()).toBe(0);
  });
});

describe('listAuditLog', () => {
  it('returns the newest rows first with details parsed from JSON', async () => {
    await withAudit(db, entry, reserve);
    await withAudit(db, { ...entry, details: { from: 'reserved', to: 'returned' } }, (tx) =>
      tx.asset.update({ where: { id: 'ebike-001' }, data: { status: 'returned' } })
    );

    const log = await listAuditLog(db);

    expect(log.map((row) => row.details)).toEqual([
      { from: 'reserved', to: 'returned' },
      { from: 'available', to: 'reserved' },
    ]);
    expect(Date.parse(log[0]?.created_at ?? '')).not.toBeNaN();
  });

  it('respects the limit', async () => {
    await withAudit(db, entry, reserve);
    await withAudit(db, entry, reserve);
    expect(await listAuditLog(db, 1)).toHaveLength(1);
  });
});

describe('notifications from withAudit', () => {
  const to = customerAddress('cust-a');
  const notify = [{ to, kind: 'hold_ended', item: 'Bike' }] as const;
  const entry = {
    actor: 'staff-dealer',
    action: 'test.done',
    entityType: 'test',
    entityId: '1',
    notify,
  };

  function listen() {
    const received: unknown[] = [];
    const stop = subscribe([to], (notification) => received.push(notification));
    return { received, stop };
  }

  it('tells the person once the change is saved', async () => {
    const { received, stop } = listen();

    await withAudit(db, entry, async () => undefined);
    stop();

    expect(received).toEqual([{ kind: 'hold_ended', item: 'Bike' }]);
  });

  it('tells nobody when the change rolls back', async () => {
    const { received, stop } = listen();

    await expect(
      withAudit(db, entry, async () => {
        throw new Error('nope');
      })
    ).rejects.toThrow('nope');
    stop();

    expect(received).toEqual([]);
  });

  it('skips the person who made the change', async () => {
    const { received, stop } = listen();

    await withAudit(db, { ...entry, actor: 'cust-a' }, async () => undefined);
    stop();

    expect(received).toEqual([]);
  });

  it('keeps the notification out of the audit details', async () => {
    await withAudit(db, entry, async () => undefined);

    const [row] = await listAuditLog(db);
    expect(row?.details).toBeNull();
  });
});
