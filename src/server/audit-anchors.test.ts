// The anchor file outside the database (docs/features/audit-chain.md, D81): one JSON line per
// committed audit row, beside the SQLite file unless AUDIT_ANCHOR_FILE names another place.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ANCHOR_FILE_ENV,
  anchorFileFor,
  appendAuditAnchor,
  readAuditAnchors,
} from './audit-anchors';
import {
  createPrismaClient,
  databaseFileOf,
  sqliteFileOf,
  type PrismaClient,
} from './prisma-client';

const hash = (c: string) => c.repeat(64);
let dir: string;
let db: PrismaClient;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'lease-loop-anchors-'));
  db = createPrismaClient(`file:${path.join(dir, 'x.db')}`);
});
afterAll(async () => {
  await db.$disconnect();
  await rm(dir, { recursive: true, force: true });
});

// Expected paths go through path.resolve, as the code does: on Windows '/data/dev.db' resolves
// to 'C:\data\dev.db' (review of #69, finding 3).
describe('sqliteFileOf', () => {
  it('resolves a file URL, drops the query, and is null for memory or other URLs', () => {
    expect(sqliteFileOf('file:/data/dev.db?mode=rwc')).toBe(path.resolve('/data/dev.db'));
    expect(sqliteFileOf('file:./dev.db')).toBe(path.resolve('dev.db'));
    expect(sqliteFileOf('file::memory:')).toBeNull();
    expect(sqliteFileOf('postgres://x')).toBeNull();
  });
});

// The bug the demo found: under Next.js this module is loaded once per bundle, and db.ts shares
// one client through globalThis, so the file must travel with the client, not sit in a map.
describe('databaseFileOf', () => {
  it('finds the file from a second copy of the module, as another Next.js bundle would', async () => {
    vi.resetModules();
    const fresh = await import('./prisma-client');
    expect(fresh.databaseFileOf).not.toBe(databaseFileOf);
    expect(fresh.databaseFileOf(db)).toBe(path.join(dir, 'x.db'));
  });

  it('falls back to DATABASE_URL for a client it did not make', () => {
    const stranger = {} as PrismaClient;
    expect(databaseFileOf(stranger, 'file:/data/dev.db')).toBe(path.resolve('/data/dev.db'));
    expect(databaseFileOf(stranger, '')).toBeNull();
  });
});

describe('anchorFileFor', () => {
  it('sits beside the database file, or where AUDIT_ANCHOR_FILE says', () => {
    expect(anchorFileFor(db, {})).toBe(path.join(dir, 'x.db.anchors.jsonl'));
    expect(anchorFileFor(db, { [ANCHOR_FILE_ENV]: '/mnt/other/anchors.jsonl' })).toBe(
      path.resolve('/mnt/other/anchors.jsonl')
    );
  });
});

describe('appendAuditAnchor and readAuditAnchors', () => {
  it('reads no file as no anchors, then reads back what was appended, in order', async () => {
    expect(await readAuditAnchors(db, {})).toEqual([]);
    await appendAuditAnchor(db, { length: 1, hash: hash('a'), at: '2026-11-06T08:00:00.000Z' }, {});
    await appendAuditAnchor(db, { length: 2, hash: hash('b'), at: '2026-11-06T08:01:00.000Z' }, {});
    expect(await readAuditAnchors(db, {})).toEqual([
      { length: 1, hash: hash('a') },
      { length: 2, hash: hash('b') },
    ]);
    const text = await readFile(anchorFileFor(db, {})!, 'utf8');
    expect(text.split('\n')).toHaveLength(3); // two lines and the final newline
  });

  it('reads a damaged line as null, for the verifier to report', async () => {
    const file = path.join(dir, 'damaged.jsonl');
    await writeFile(file, `{"length":1,"hash":"${hash('c')}"}\nnonsense\n`);
    expect(await readAuditAnchors(db, { [ANCHOR_FILE_ENV]: file })).toEqual([
      { length: 1, hash: hash('c') },
      null,
    ]);
  });
});
