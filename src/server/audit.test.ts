// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { readFile, writeFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { resetDb } from '../../tests/helpers/reset-db';
import {
  GENESIS_HASH,
  hashAuditEntry,
  headSigningMessage,
  rowSigningMessage,
} from '@/domain/audit';
import {
  auditChainHead,
  listAuditLog,
  verifyAuditChain,
  withAudit,
  type AuditEntry,
} from './audit';
import type { PrismaClient } from './prisma-client';
import { RowRuleError } from './row-rules';
import { anchorFileFor } from './audit-anchors';
import { auditSigner, SIGNING_KEY_ENV } from './audit-signing';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(db);
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
    // A BigInt passes the entry check but JSON.stringify throws on it: the audit write fails
    // inside the transaction, after the change was made.
    const broken = { ...entry, details: { amount: BigInt(1) } };
    let changed = false;

    await expect(
      withAudit(db, broken, async (tx) => {
        await reserve(tx);
        changed = true;
      })
    ).rejects.toThrow(/BigInt/);

    expect(changed).toBe(true);
    expect(await currentStatus()).toBe('available');
    expect(await db.auditLog.count()).toBe(0);
  });

  it('refuses an entry that breaks its schema before the change runs (D27)', async () => {
    let ran = false;
    const broken = { ...entry, action: 'reserved an asset' };

    await expect(
      withAudit(db, broken, async () => {
        ran = true;
      })
    ).rejects.toThrow(RowRuleError);

    expect(ran).toBe(false);
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

describe('the audit chain', () => {
  const at = (minute: number) => `2026-11-05T10:${String(minute).padStart(2, '0')}:00.000Z`;

  async function rowsInOrder() {
    return db.auditLog.findMany({ orderBy: { id: 'asc' } });
  }

  it('chains the second row to the first and the first to the genesis hash', async () => {
    await withAudit(db, entry, reserve, at(0));
    await withAudit(db, entry, reserve, at(1));

    const [first, second] = await rowsInOrder();
    expect(first?.prev_hash).toBe(GENESIS_HASH);
    expect(first?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(second?.prev_hash).toBe(first?.hash);
    expect(second?.hash).not.toBe(first?.hash);
  });

  it('sets created_at from the instant it is given and hashes it', async () => {
    await withAudit(db, entry, reserve, '2026-11-05T10:00:00Z');
    const row = await db.auditLog.findFirstOrThrow();
    expect(row.created_at.toISOString()).toBe('2026-11-05T10:00:00.000Z');
    expect(row.hash).toBe(
      hashAuditEntry(GENESIS_HASH, {
        actor: entry.actor,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        details: entry.details,
        createdAt: '2026-11-05T10:00:00.000Z',
      })
    );
  });

  it('chains the next row to the last good one after a failed change', async () => {
    await withAudit(db, entry, reserve, at(0));
    await expect(
      withAudit(
        db,
        entry,
        async () => {
          throw new Error('refused');
        },
        at(1)
      )
    ).rejects.toThrow('refused');
    await withAudit(db, entry, reserve, at(2));

    const rows = await rowsInOrder();
    expect(rows).toHaveLength(2);
    expect(rows[1]?.prev_hash).toBe(rows[0]?.hash);
    expect((await verifyAuditChain(db)).ok).toBe(true);
  });

  it('verifies after ten writes and reports the head', async () => {
    for (let minute = 0; minute < 10; minute++) {
      await withAudit(db, { ...entry, details: { minute } }, reserve, at(minute));
    }
    const head = await auditChainHead(db);
    expect(await verifyAuditChain(db)).toEqual({
      ok: true,
      length: 10,
      headHash: head,
      signaturesChecked: true,
      anchoredLength: 10,
      publicKey: auditSigner()!.publicKey,
    });
    expect(head).toBe((await rowsInOrder())[9]?.hash);
  });

  it('reports the row whose details were edited behind the app', async () => {
    for (let minute = 0; minute < 3; minute++) {
      await withAudit(db, { ...entry, details: { minute } }, reserve, at(minute));
    }
    const target = (await rowsInOrder())[1]!;
    // The test may do this; the app never does (tests/meta-rules.test.ts).
    await db.$executeRaw`UPDATE "AuditLog" SET details_json = '{"minute":7}' WHERE id = ${target.id}`;

    expect(await verifyAuditChain(db)).toMatchObject({
      ok: false,
      brokenAt: target.id,
      reason: 'hash_mismatch',
    });
  });

  it('reports the newest row deleted behind the app against the stored head (review finding 11)', async () => {
    for (let minute = 0; minute < 3; minute++) {
      await withAudit(db, { ...entry, details: { minute } }, reserve, at(minute));
    }
    const newest = (await rowsInOrder()).at(-1)!;
    // The test may do this; the app never does (tests/meta-rules.test.ts).
    await db.$executeRaw`DELETE FROM "AuditLog" WHERE id = ${newest.id}`;
    expect(await verifyAuditChain(db)).toMatchObject({
      ok: false,
      brokenAt: newest.id,
      reason: 'head_mismatch',
    });
  });

  it('reports a log whose head row was deleted', async () => {
    await withAudit(db, entry, reserve, at(0));
    await db.$executeRaw`DELETE FROM "AuditHead"`;
    expect(await verifyAuditChain(db)).toMatchObject({ ok: false, reason: 'head_mismatch' });
  });

  it('reports a re-timed row', async () => {
    await withAudit(db, entry, reserve, at(0));
    const row = await db.auditLog.findFirstOrThrow();
    await db.$executeRaw`UPDATE "AuditLog" SET created_at = ${new Date(at(5))} WHERE id = ${row.id}`;
    expect(await verifyAuditChain(db)).toMatchObject({ ok: false, brokenAt: row.id });
  });

  it('reports a log whose hashes were all nulled as broken at its first row', async () => {
    await withAudit(db, entry, reserve, at(0));
    await withAudit(db, entry, reserve, at(1));
    await db.$executeRaw`UPDATE "AuditLog" SET hash = NULL, prev_hash = NULL`;
    const [first] = await rowsInOrder();
    expect(await verifyAuditChain(db)).toMatchObject({
      ok: false,
      brokenAt: first?.id,
      reason: 'unhashed_in_chain',
    });
  });

  it('refuses a second row chained to the same previous row (a fork)', async () => {
    await withAudit(db, entry, reserve, at(0));
    const [first] = await rowsInOrder();
    // A row written behind withAudit, pointing at the genesis like row 1: the unique prev_hash
    // index refuses it.
    await expect(
      db.auditLog.create({
        data: {
          actor: 'mallory',
          action: 'asset.forked',
          entity_type: 'asset',
          entity_id: 'ebike-001',
          prev_hash: first?.prev_hash,
          hash: 'f'.repeat(64),
        },
      })
    ).rejects.toThrow();
  });

  it('gives the genesis head for an empty log', async () => {
    expect(await auditChainHead(db)).toBe(GENESIS_HASH);
    expect(await verifyAuditChain(db)).toEqual({
      ok: true,
      length: 0,
      headHash: GENESIS_HASH,
      signaturesChecked: true,
      anchoredLength: 0,
      publicKey: auditSigner()!.publicKey,
    });
  });
});

// D81: the seal. The attack D36 could not see is a rewrite of both tables with fresh hashes;
// the forger here has database access but not the key in the environment.
describe('the seal: signatures and anchors', () => {
  const at = (minute: number) => `2026-11-05T11:${String(minute).padStart(2, '0')}:00.000Z`;

  async function writeThree() {
    for (let minute = 0; minute < 3; minute++) {
      await withAudit(db, { ...entry, details: { minute } }, reserve, at(minute));
    }
    return db.auditLog.findMany({ orderBy: { id: 'asc' } });
  }

  /** What someone with the database but not the key can do: edit row 2, recompute everything. */
  async function rewriteFromSecondRow() {
    const rows = await db.auditLog.findMany({ orderBy: { id: 'asc' } });
    let prevHash = rows[0]!.hash!;
    for (const row of rows.slice(1)) {
      const details = row.id === rows[1]!.id ? { minute: 7 } : JSON.parse(row.details_json!);
      const hash = hashAuditEntry(prevHash, {
        actor: row.actor,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        details,
        createdAt: row.created_at.toISOString(),
      });
      await db.$executeRaw`UPDATE "AuditLog" SET details_json = ${JSON.stringify(details)}, prev_hash = ${prevHash}, hash = ${hash} WHERE id = ${row.id}`;
      prevHash = hash;
    }
    await db.$executeRaw`UPDATE "AuditHead" SET hash = ${prevHash}`;
    return rows;
  }

  it('signs every row hash and the head with the key in the environment', async () => {
    const rows = await writeThree();
    const signer = auditSigner()!;
    for (const row of rows) {
      expect(signer.check(rowSigningMessage(row.hash!), row.signature!)).toBe(true);
    }
    const head = await db.auditHead.findFirstOrThrow();
    expect(signer.check(headSigningMessage(head), head.signature!)).toBe(true);
  });

  it('appends one anchor line per committed row, after the commit', async () => {
    const rows = await writeThree();
    const lines = (await readFile(anchorFileFor(db)!, 'utf8')).trim().split('\n');
    expect(lines.map((line) => JSON.parse(line))).toEqual(
      rows.map((row, i) => ({ length: i + 1, hash: row.hash, at: at(i) }))
    );
  });

  it('writes no anchor for a change that failed', async () => {
    await expect(
      withAudit(db, entry, async () => {
        throw new Error('refused');
      })
    ).rejects.toThrow('refused');
    await expect(readFile(anchorFileFor(db)!, 'utf8')).rejects.toThrow(/ENOENT/);
  });

  it('catches a rewrite of both tables with fresh hashes: the signature of row 2 fails', async () => {
    await writeThree();
    const rows = await rewriteFromSecondRow();
    expect(await verifyAuditChain(db)).toMatchObject({
      ok: false,
      brokenAt: rows[1]!.id,
      reason: 'signature_mismatch',
    });
  });

  it('catches the same rewrite with no key set, through the anchor file', async () => {
    await writeThree();
    const rows = await rewriteFromSecondRow();
    vi.stubEnv(SIGNING_KEY_ENV, '');
    try {
      expect(await verifyAuditChain(db)).toEqual({
        ok: false,
        brokenAt: rows[1]!.id,
        reason: 'anchor_mismatch',
        publicKey: null,
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('reports a damaged anchor file, and anchors that lag behind as a lag, not a break', async () => {
    await writeThree();
    const file = anchorFileFor(db)!;
    const lines = (await readFile(file, 'utf8')).trim().split('\n');
    await writeFile(file, `${lines[0]}\n`);
    expect(await verifyAuditChain(db)).toMatchObject({ ok: true, length: 3, anchoredLength: 1 });
    await writeFile(file, `${lines[0]}\n{oops\n`);
    expect(await verifyAuditChain(db)).toMatchObject({ ok: false, reason: 'anchor_unreadable' });
  });

  // Review of #69, finding 2: another request commits between the verifier's reads. The rows
  // come back with n entries, then row n+1 and its anchor land. The anchors were read first,
  // so they lag; read after the rows, anchor n+1 would read as a rewrite of an untouched log.
  it('reads an untouched log as intact when a change commits between its reads', async () => {
    await writeThree();
    const findMany = db.auditLog.findMany.bind(db.auditLog);
    const auditLog = new Proxy(db.auditLog, {
      get: (target, prop, receiver) =>
        prop === 'findMany'
          ? async (args: Parameters<typeof findMany>[0]) => {
              const rows = await findMany(args);
              await withAudit(db, { ...entry, details: { minute: 9 } }, reserve, at(9));
              return rows;
            }
          : Reflect.get(target, prop, receiver),
    });
    const racing = new Proxy(db, {
      get: (target, prop, receiver) =>
        prop === 'auditLog' ? auditLog : Reflect.get(target, prop, receiver),
    });

    expect(await verifyAuditChain(racing)).toMatchObject({
      ok: true,
      length: 3,
      anchoredLength: 3,
    });
    expect(await verifyAuditChain(db)).toMatchObject({ ok: true, length: 4, anchoredLength: 4 });
  });

  // Review of #69, finding 7: a key in .env that cannot be read must not take the audit page down.
  it('verifies with the signatures unchecked when the key cannot be read, and still refuses writes', async () => {
    await writeThree();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubEnv(SIGNING_KEY_ENV, 'bm90IGEga2V5');
    try {
      expect(await verifyAuditChain(db)).toMatchObject({
        ok: true,
        length: 3,
        signaturesChecked: false,
        publicKey: null,
      });
      expect(log).toHaveBeenCalledWith(
        'audit signatures not checked:',
        expect.stringMatching(/AUDIT_SIGNING_KEY is not a base64/)
      );
      await expect(withAudit(db, entry, reserve)).rejects.toThrow(
        /AUDIT_SIGNING_KEY is not a base64/
      );
    } finally {
      vi.unstubAllEnvs();
      log.mockRestore();
    }
  });

  it('refuses to write without a key, before the change runs', async () => {
    vi.stubEnv(SIGNING_KEY_ENV, '');
    let ran = false;
    try {
      await expect(
        withAudit(db, entry, async () => {
          ran = true;
        })
      ).rejects.toThrow(/AUDIT_SIGNING_KEY is not set/);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(ran).toBe(false);
    expect(await db.auditLog.count()).toBe(0);
  });
});
