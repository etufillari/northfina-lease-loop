// The tamper-evident audit chain (docs/features/audit-chain.md, D36).
//
//   hash = SHA-256 hex of  prevHash + '\n' + canonicalJson(entry)
//
// where prevHash is the hash of the row before (GENESIS_HASH for the first hashed row) and the
// entry is { actor, action, entityType, entityId, details, createdAt }. Editing any field of a
// row, re-timing it, deleting it or moving it breaks the row's own hash or the next row's
// prevHash. Deleting the newest rows leaves a valid shorter chain, so the verifier also compares
// the chain with the head stored beside it (count and hash, written in the same transaction as
// every row; review finding 11). Tamper-evident, not tamper-proof: someone who can rewrite both
// tables can recompute every hash, which is what anchoring the head outside the database answers.
// node:crypto's createHash is deterministic: no clock, randomness or I/O.
import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical';

/** The prevHash of the first hashed row: 64 zeros. */
export const GENESIS_HASH = '0'.repeat(64);

/** What a row's hash covers. `createdAt` is an ISO instant passed in; the domain reads no clock. */
export type AuditChainEntry = {
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  /** The stored details as parsed from details_json, or null for none. */
  details: unknown;
  createdAt: string;
};

/** A stored row. The columns are nullable in the database; a null hash is a break. */
export type AuditChainRow = AuditChainEntry & {
  id: number;
  prevHash: string | null;
  hash: string | null;
};

export type AuditChainBreak =
  'prev_hash_mismatch' | 'hash_mismatch' | 'unhashed_in_chain' | 'head_mismatch';

/** The head stored beside the log: how many rows it had and the newest row's hash. */
export type AuditChainHead = { length: number; hash: string };

export type AuditChainVerdict =
  | { ok: true; length: number; headHash: string }
  | { ok: false; brokenAt: number; reason: AuditChainBreak };

/** The hash of `entry` chained to `prevHash`. */
export function hashAuditEntry(prevHash: string, entry: AuditChainEntry): string {
  const canonical = canonicalJson({
    actor: entry.actor,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    details: entry.details,
    createdAt: entry.createdAt,
  });
  return createHash('sha256').update(`${prevHash}\n${canonical}`, 'utf8').digest('hex');
}

/**
 * Walks `rows` in id order and names the first broken row. Every row must be hashed: a null
 * hash is `unhashed_in_chain`, so nulling the hash columns cannot pass as an intact log.
 * `headHash` is the last row's hash (GENESIS_HASH for an empty log).
 *
 * `storedHead`, when given, must match the walked chain: a different count or hash is
 * `head_mismatch` at the first id after the last row left (the newest rows were deleted); null
 * (no head stored) with rows is a mismatch at the last row. Undefined skips the comparison.
 */
export function verifyAuditChain(
  rows: readonly AuditChainRow[],
  storedHead?: AuditChainHead | null
): AuditChainVerdict {
  let headHash = GENESIS_HASH;
  for (const row of rows) {
    if (row.hash === null) return { ok: false, brokenAt: row.id, reason: 'unhashed_in_chain' };
    if (row.prevHash !== headHash) {
      return { ok: false, brokenAt: row.id, reason: 'prev_hash_mismatch' };
    }
    if (hashAuditEntry(row.prevHash, row) !== row.hash) {
      return { ok: false, brokenAt: row.id, reason: 'hash_mismatch' };
    }
    headHash = row.hash;
  }
  const lastId = rows.at(-1)?.id ?? 0;
  if (storedHead === null && rows.length > 0) {
    return { ok: false, brokenAt: lastId, reason: 'head_mismatch' };
  }
  if (storedHead && (storedHead.length !== rows.length || storedHead.hash !== headHash)) {
    return { ok: false, brokenAt: lastId + 1, reason: 'head_mismatch' };
  }
  return { ok: true, length: rows.length, headHash };
}
