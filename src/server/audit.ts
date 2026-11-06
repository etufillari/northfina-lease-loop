// Audit trail: every change to business data writes an AuditLog row in the SAME database
// transaction as the change. If either write fails, both are rolled back, so the database
// can never hold a change that nobody can explain.
//
// The rows form a hash chain (docs/features/audit-chain.md, D36): each row stores the hash of
// the row before it and its own hash over that plus its canonical content, so an edit, a
// deletion or a reordering made outside the app shows up in verifyAuditChain. Tamper-evident,
// not tamper-proof: the head hash is the anchor a person copies out of the database.
//
// The seal (D81) closes the two holes D36 left: every row's hash and the head are signed with
// the Ed25519 key in .env (audit-signing.ts), so a rewrite with fresh hashes needs the key, and
// after the commit the head is appended to an anchor file outside the database (audit-anchors.ts).
import {
  GENESIS_HASH,
  hashAuditEntry,
  headSigningMessage,
  rowSigningMessage,
  verifySealedChain,
  type AuditSealVerdict,
} from '@/domain/audit';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { auditEntrySchema } from '@/domain/rows/audit-entry';
import { appendAuditAnchor, readAuditAnchors } from './audit-anchors';
import { auditSigner, SIGNING_KEY_ENV } from './audit-signing';
import { parseRow } from './row-rules';

export type AuditEntry = {
  /** Who did it (a user id or name; there is no login in the starter). */
  actor: string;
  /** What happened, as `<entity>.<verb>`, e.g. `asset.status_changed`. */
  action: string;
  entityType: string;
  entityId: string;
  /** Anything useful for a later reader, e.g. `{ from: 'available', to: 'reserved' }`. Stored as JSON. */
  details?: unknown;
};

export type TransactionClient = Prisma.TransactionClient;

/** The one row of `AuditHead`. */
const AUDIT_HEAD_ID = 1;

/**
 * Runs `work` inside a transaction and records `entry` in the audit log.
 * Use the `tx` you are given for every write in `work`; writes through `db` would
 * escape the transaction.
 *
 *   const asset = await withAudit(db, { actor, action: 'asset.status_changed', ... },
 *     (tx) => tx.asset.update({ where: { id }, data: { status } }));
 */
export async function withAudit<T>(
  db: PrismaClient,
  entry: AuditEntry,
  work: (tx: TransactionClient) => Promise<T>,
  /** The row's instant (ISO); the server clock, read once here, when not given. */
  now: string = new Date().toISOString()
): Promise<T> {
  // Checked before the change runs: an entry that cannot be written must not cost the work.
  parseRow('audit entry', auditEntrySchema, entry);
  // Fail closed: an unsigned row would read as a break, so no change is made without the key.
  const signer = auditSigner();
  if (!signer) {
    throw new Error(`${SIGNING_KEY_ENV} is not set. Run \`npm run db:setup\` to add one to .env.`);
  }
  // Normalised to the millisecond ISO form the database gives back, so the hash re-verifies.
  const createdAt = new Date(now).toISOString();
  // Set inside the transaction, read after its commit.
  const committed: { anchor?: { length: number; hash: string } } = {};
  const result = await db.$transaction(async (tx) => {
    const result = await work(tx);
    // SQLite serialises writers, so no other transaction can chain to the same previous row
    // between this read and the insert; the unique prev_hash column is the second guard (two
    // rows can never chain to the same row). On
    // Postgres this read needs SELECT … FOR UPDATE or an advisory lock.
    const previous = await tx.auditLog.findFirst({
      orderBy: { id: 'desc' },
      select: { hash: true },
    });
    const prevHash = previous?.hash ?? GENESIS_HASH;
    const detailsJson = entry.details === undefined ? null : JSON.stringify(entry.details);
    const hash = hashAuditEntry(prevHash, {
      actor: entry.actor,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      // Hashed as stored: what JSON.parse gives back from details_json.
      details: detailsJson === null ? null : JSON.parse(detailsJson),
      createdAt,
    });
    await tx.auditLog.create({
      data: {
        created_at: new Date(createdAt),
        actor: entry.actor,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        details_json: detailsJson,
        prev_hash: prevHash,
        hash,
        signature: signer.sign(rowSigningMessage(hash)),
      },
    });
    // The head beside the log, in the same transaction (review finding 11): the verifier sees a
    // deleted newest row as a count or hash that no longer matches.
    const length = await tx.auditLog.count();
    const headSignature = signer.sign(headSigningMessage({ length, hash }));
    await tx.auditHead.upsert({
      where: { id: AUDIT_HEAD_ID },
      create: { id: AUDIT_HEAD_ID, length, hash, signature: headSignature },
      update: { length, hash, signature: headSignature },
    });
    committed.anchor = { length, hash };
    return result;
  });
  // After the commit, never before: the file may lag behind the log but never hold a head the
  // log does not have. A failed append costs only the anchor; the change is already committed.
  if (committed.anchor) {
    try {
      await appendAuditAnchor(db, { ...committed.anchor, at: createdAt });
    } catch (error) {
      console.error('audit anchor not written', error);
    }
  }
  return result;
}

export type AuditLogEntry = {
  id: number;
  created_at: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: unknown;
};

/** The newest audit rows first. */
export async function listAuditLog(db: PrismaClient, limit = 50): Promise<AuditLogEntry[]> {
  const rows = await db.auditLog.findMany({
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    take: limit,
  });
  return rows.map((row) => ({
    id: row.id,
    created_at: row.created_at.toISOString(),
    actor: row.actor,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    details: row.details_json === null ? null : parseStoredJson(row.details_json),
  }));
}

/** The details of the newest audit row of one action on one entity, or null when there is none. */
export async function latestAuditDetails(
  db: PrismaClient,
  where: { action: string; entityType: string; entityId: string }
): Promise<unknown> {
  const row = await db.auditLog.findFirst({
    where: { action: where.action, entity_type: where.entityType, entity_id: where.entityId },
    orderBy: { id: 'desc' },
    select: { details_json: true },
  });
  return row?.details_json ? parseStoredJson(row.details_json) : null;
}

/** The verdict and the public key that checked the signatures (null when no key is set). */
export type AuditVerification = AuditSealVerdict & { publicKey: string | null };

/**
 * Walks the whole audit log in id order and names the first broken row: the hash chain, the
 * signatures and the anchors outside the database (see domain/audit).
 */
export async function verifyAuditChain(db: PrismaClient): Promise<AuditVerification> {
  // The anchors first (review of #69): withAudit appends an anchor after its commit, so a file
  // read before the rows can only lag behind them. Read together, a change committed between
  // the reads would leave an anchor longer than the rows read: a rewrite that never happened.
  const anchors = await readAuditAnchors(db);
  const [rows, head] = await Promise.all([
    db.auditLog.findMany({ orderBy: { id: 'asc' } }),
    db.auditHead.findUnique({ where: { id: AUDIT_HEAD_ID } }),
  ]);
  const signer = signerForVerifying();
  const verdict = verifySealedChain(
    rows.map((row) => ({
      id: row.id,
      prevHash: row.prev_hash,
      hash: row.hash,
      actor: row.actor,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      details: row.details_json === null ? null : parseStoredJson(row.details_json),
      createdAt: row.created_at.toISOString(),
      signature: row.signature,
    })),
    head ? { length: head.length, hash: head.hash, signature: head.signature } : null,
    { checkSignature: signer?.check ?? null, anchors }
  );
  return { ...verdict, publicKey: signer?.publicKey ?? null };
}

/** The newest row's hash, or the genesis hash for an empty log. */
export async function auditChainHead(db: PrismaClient): Promise<string> {
  const newest = await db.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
  return newest?.hash ?? GENESIS_HASH;
}

/** details_json as parsed, or the raw text when someone stored text that is not JSON. */
function parseStoredJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * The signer for the verifier, or null when the key in .env cannot be read (review of #69,
 * finding 7): the page then says the signatures were not checked instead of failing with a
 * 500. The reason goes to the server log only. Writes still refuse a bad key (withAudit).
 */
function signerForVerifying() {
  try {
    return auditSigner();
  } catch (error) {
    console.error('audit signatures not checked:', error instanceof Error ? error.message : error);
    return null;
  }
}
