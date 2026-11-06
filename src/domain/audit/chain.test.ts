// The tamper-evident audit chain (docs/features/audit-chain.md, D36): each row's hash covers the
// previous row's hash, so editing, deleting or reordering a row breaks every hash after it.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from './canonical';
import {
  GENESIS_HASH,
  hashAuditEntry,
  verifyAuditChain,
  type AuditChainEntry,
  type AuditChainRow,
} from './chain';

const entries: AuditChainEntry[] = [
  {
    actor: 'admin',
    action: 'quote.created',
    entityType: 'quote',
    entityId: 'Q-1',
    details: { monthlyCents: 4_990 },
    createdAt: '2026-11-05T10:00:00.000Z',
  },
  {
    actor: 'customer-1',
    action: 'application.submitted',
    entityType: 'application',
    entityId: 'A-1',
    details: { quoteId: 'Q-1' },
    createdAt: '2026-11-05T10:05:00.000Z',
  },
  {
    actor: 'admin',
    action: 'contract.signed',
    entityType: 'contract',
    entityId: 'C-1',
    details: null,
    createdAt: '2026-11-05T10:10:00.000Z',
  },
];

/** Rows 1..n chained the way withAudit writes them. */
function chainOf(list: AuditChainEntry[], firstId = 1): AuditChainRow[] {
  let prevHash = GENESIS_HASH;
  return list.map((entry, index) => {
    const hash = hashAuditEntry(prevHash, entry);
    const row = { id: firstId + index, prevHash, hash, ...entry };
    prevHash = hash;
    return row;
  });
}

describe('hashAuditEntry', () => {
  it('is SHA-256 hex over prevHash, a newline and the canonical entry', () => {
    const entry = entries[0]!;
    const expected = createHash('sha256')
      .update(`${GENESIS_HASH}\n${canonicalJson(entry)}`, 'utf8')
      .digest('hex');
    expect(hashAuditEntry(GENESIS_HASH, entry)).toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not depend on key order and changes with any field, the time included', () => {
    const entry = entries[1]!;
    const reordered = {
      createdAt: entry.createdAt,
      details: entry.details,
      entityId: entry.entityId,
      entityType: entry.entityType,
      action: entry.action,
      actor: entry.actor,
    };
    const hash = hashAuditEntry(GENESIS_HASH, entry);
    expect(hashAuditEntry(GENESIS_HASH, reordered)).toBe(hash);
    expect(
      hashAuditEntry(GENESIS_HASH, { ...entry, createdAt: '2026-11-05T10:05:00.001Z' })
    ).not.toBe(hash);
    expect(hashAuditEntry('f'.repeat(64), entry)).not.toBe(hash);
  });

  it('starts from a genesis hash of 64 zeros', () => {
    expect(GENESIS_HASH).toBe('0'.repeat(64));
  });
});

describe('verifyAuditChain', () => {
  it('accepts an empty log with the genesis head', () => {
    expect(verifyAuditChain([])).toEqual({
      ok: true,
      length: 0,
      headHash: GENESIS_HASH,
    });
  });

  it('verifies a three-row chain and names its head', () => {
    const rows = chainOf(entries);
    expect(verifyAuditChain(rows)).toEqual({
      ok: true,
      length: 3,
      headHash: rows[2]!.hash,
    });
  });

  it('breaks at row 2 with hash_mismatch when one character of its details changes', () => {
    const rows = chainOf(entries);
    rows[1] = { ...rows[1]!, details: { quoteId: 'Q-2' } };
    expect(verifyAuditChain(rows)).toEqual({ ok: false, brokenAt: 2, reason: 'hash_mismatch' });
  });

  it('breaks with hash_mismatch when a row is re-timed', () => {
    const rows = chainOf(entries);
    rows[0] = { ...rows[0]!, createdAt: '2026-11-04T10:00:00.000Z' };
    expect(verifyAuditChain(rows)).toEqual({ ok: false, brokenAt: 1, reason: 'hash_mismatch' });
  });

  it('breaks at row 3 with prev_hash_mismatch when row 2 is deleted', () => {
    const rows = chainOf(entries);
    rows.splice(1, 1);
    expect(verifyAuditChain(rows)).toEqual({
      ok: false,
      brokenAt: 3,
      reason: 'prev_hash_mismatch',
    });
  });

  it('breaks when two rows swap places', () => {
    const [one, two, three] = chainOf(entries);
    const result = verifyAuditChain([one!, three!, two!]);
    expect(result).toEqual({ ok: false, brokenAt: 3, reason: 'prev_hash_mismatch' });
  });

  it('breaks with prev_hash_mismatch when a stored prev hash is edited', () => {
    const rows = chainOf(entries);
    rows[1] = { ...rows[1]!, prevHash: GENESIS_HASH };
    expect(verifyAuditChain(rows)).toEqual({
      ok: false,
      brokenAt: 2,
      reason: 'prev_hash_mismatch',
    });
  });

  it('calls an unhashed row anywhere unhashed_in_chain: nulling every hash does not pass', () => {
    const rows = chainOf(entries).map((row) => ({ ...row, prevHash: null, hash: null }));
    expect(verifyAuditChain(rows)).toEqual({ ok: false, brokenAt: 1, reason: 'unhashed_in_chain' });
  });

  it('calls an unhashed row after a hashed one unhashed_in_chain', () => {
    const rows = chainOf(entries);
    rows[2] = { ...rows[2]!, prevHash: null, hash: null };
    expect(verifyAuditChain(rows)).toEqual({ ok: false, brokenAt: 3, reason: 'unhashed_in_chain' });
  });

  it('calls a row with a hash but no prev hash prev_hash_mismatch', () => {
    const rows = chainOf(entries);
    rows[0] = { ...rows[0]!, prevHash: null };
    expect(verifyAuditChain(rows)).toEqual({
      ok: false,
      brokenAt: 1,
      reason: 'prev_hash_mismatch',
    });
  });
});

describe('verifyAuditChain against the stored head (review finding 11)', () => {
  it('an intact chain matches its head: count and hash', () => {
    const rows = chainOf(entries);
    expect(verifyAuditChain(rows, { length: 3, hash: rows[2]!.hash! })).toMatchObject({ ok: true });
  });

  it('the newest row deleted: the chain alone is intact, the head names the missing row', () => {
    const rows = chainOf(entries);
    const head = { length: 3, hash: rows[2]!.hash! };
    const cut = rows.slice(0, 2);
    expect(verifyAuditChain(cut).ok).toBe(true);
    expect(verifyAuditChain(cut, head)).toEqual({
      ok: false,
      brokenAt: 3,
      reason: 'head_mismatch',
    });
  });

  it('the newest two deleted, or every row deleted, is a head mismatch too', () => {
    const rows = chainOf(entries);
    const head = { length: 3, hash: rows[2]!.hash! };
    expect(verifyAuditChain(rows.slice(0, 1), head)).toMatchObject({ brokenAt: 2 });
    expect(verifyAuditChain([], head)).toMatchObject({ ok: false, brokenAt: 1 });
  });

  it('rows but no stored head (the head row deleted) is a head mismatch; no rows and no head is intact', () => {
    const rows = chainOf(entries);
    expect(verifyAuditChain(rows, null)).toEqual({
      ok: false,
      brokenAt: rows[2]!.id,
      reason: 'head_mismatch',
    });
    expect(verifyAuditChain([], null)).toMatchObject({ ok: true, length: 0 });
  });
});
