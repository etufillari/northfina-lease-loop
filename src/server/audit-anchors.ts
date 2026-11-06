// The anchor file (docs/features/audit-chain.md, D81): after every committed audit row, the
// head (length, hash) is appended as one JSON line to a file outside the database. The file is
// beside the SQLite file by default (`dev.db.anchors.jsonl`); AUDIT_ANCHOR_FILE moves it to
// another disk or a synced folder, which is where it protects most. A full rewrite of the
// audit tables then disagrees with what the file kept. `npm run audit:anchor` goes one step
// further and has an outside timestamp authority sign the head (scripts/anchor-audit-tsa.mjs).
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { formatAnchorLine, parseAnchorLines, type AuditAnchor } from '@/domain/audit';
import { databaseFileOf, type PrismaClient } from './prisma-client';

export const ANCHOR_FILE_ENV = 'AUDIT_ANCHOR_FILE';

/** The environment, or a stand-in for it in tests. */
type Env = Readonly<Record<string, string | undefined>>;

/** Where `db`'s anchors are kept; null for a database that is not a file (no anchors). */
export function anchorFileFor(db: PrismaClient, env: Env = process.env) {
  const configured = env[ANCHOR_FILE_ENV]?.trim();
  if (configured) return path.resolve(configured);
  const file = databaseFileOf(db);
  return file ? `${file}.anchors.jsonl` : null;
}

/** Appends one anchor line. Called after the commit, so the file can lag but never lead. */
export async function appendAuditAnchor(
  db: PrismaClient,
  anchor: AuditAnchor & { at: string },
  env: Env = process.env
): Promise<void> {
  const file = anchorFileFor(db, env);
  if (file) await appendFile(file, `${formatAnchorLine(anchor)}\n`, 'utf8');
}

/** The anchor lines in file order (null for a damaged line); none when there is no file yet. */
export async function readAuditAnchors(
  db: PrismaClient,
  env: Env = process.env
): Promise<(AuditAnchor | null)[]> {
  const file = anchorFileFor(db, env);
  if (!file) return [];
  try {
    return parseAnchorLines(await readFile(file, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}
