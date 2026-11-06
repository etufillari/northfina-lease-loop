// GET /api/audit-log/verify against a real, migrated SQLite database: the app's `db` module is
// pointed at the test database, nothing else is replaced.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDb } from '../../../../../tests/helpers/reset-db';
import { createTestDb } from '../../../../../tests/helpers/test-db';
import { GENESIS_HASH } from '@/domain/audit';
import { auditChainVerdictSchema } from '@/server/audit-schemas';
import { withAudit } from '@/server/audit';
import { auditSigner } from '@/server/audit-signing';
import type { PrismaClient } from '@/server/prisma-client';

const holder = vi.hoisted(() => ({ db: undefined as unknown as PrismaClient }));
vi.mock('@/server/db', () => ({
  get db() {
    return holder.db;
  },
}));

const { GET } = await import('./route');

let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db: holder.db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(holder.db);
});

const write = (minute: number) =>
  withAudit(
    holder.db,
    { actor: 'admin', action: 'asset.noted', entityType: 'asset', entityId: `ebike-00${minute}` },
    async () => null,
    `2026-11-05T10:0${minute}:00.000Z`
  );

async function verify() {
  const response = await GET(new Request('http://localhost/api/audit-log/verify'), {
    params: Promise.resolve({}),
  });
  const body = await response.json();
  return { status: response.status, body };
}

describe('GET /api/audit-log/verify', () => {
  it('answers an empty log as intact with the genesis head', async () => {
    const { status, body } = await verify();
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      ok: true,
      length: 0,
      headHash: GENESIS_HASH,
      signaturesChecked: true,
      anchoredLength: 0,
      publicKey: auditSigner()!.publicKey,
    });
  });

  it('answers an intact chain with its length and head, matching the contract', async () => {
    await write(1);
    await write(2);
    const { body } = await verify();
    const newest = await holder.db.auditLog.findFirstOrThrow({ orderBy: { id: 'desc' } });
    expect(body.data).toEqual({
      ok: true,
      length: 2,
      headHash: newest.hash,
      signaturesChecked: true,
      anchoredLength: 2,
      publicKey: auditSigner()!.publicKey,
    });
    expect(auditChainVerdictSchema.parse(body.data)).toEqual(body.data);
  });

  it('names the first broken row through ok()', async () => {
    await write(1);
    await write(2);
    const first = await holder.db.auditLog.findFirstOrThrow({ orderBy: { id: 'asc' } });
    await holder.db.$executeRaw`UPDATE "AuditLog" SET actor = 'mallory' WHERE id = ${first.id}`;

    const { status, body } = await verify();
    expect(status).toBe(200);
    expect(body.data).toEqual({
      ok: false,
      brokenAt: first.id,
      reason: 'hash_mismatch',
      publicKey: auditSigner()!.publicKey,
    });
    expect(auditChainVerdictSchema.parse(body.data)).toEqual(body.data);
  });
});
