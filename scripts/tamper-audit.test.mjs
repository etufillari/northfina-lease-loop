import { describe, expect, it } from 'vitest';
import { GENESIS_HASH, hashAuditEntry, verifyAuditChain } from '../src/domain/audit/index.ts';
import { parseTamperArgs, rewriteChain, tamperedDetails } from './tamper-audit.mjs';

describe('parseTamperArgs', () => {
  it('takes the newest row by default and --id <n> otherwise', () => {
    expect(parseTamperArgs([])).toEqual({ id: null, rewrite: false });
    expect(parseTamperArgs(['--id', '3'])).toEqual({ id: 3, rewrite: false });
  });

  it('takes --rewrite before or after --id', () => {
    expect(parseTamperArgs(['--rewrite'])).toEqual({ id: null, rewrite: true });
    expect(parseTamperArgs(['--rewrite', '--id', '2'])).toEqual({ id: 2, rewrite: true });
    expect(parseTamperArgs(['--id', '2', '--rewrite'])).toEqual({ id: 2, rewrite: true });
  });

  it('refuses anything else', () => {
    expect(() => parseTamperArgs(['--id'])).toThrow('usage');
    expect(() => parseTamperArgs(['--id', '0'])).toThrow('usage');
    expect(() => parseTamperArgs(['3'])).toThrow('usage');
    expect(() => parseTamperArgs(['--rewrite', '--rewrite'])).toThrow('usage');
    expect(() => parseTamperArgs(['--id', '1', '--id', '2'])).toThrow('usage');
  });
});

describe('tamperedDetails', () => {
  it('adds tampered: true to object details', () => {
    expect(tamperedDetails('{"to":"reserved"}')).toBe('{"to":"reserved","tampered":true}');
  });

  it('wraps null, a scalar or non-JSON text', () => {
    expect(tamperedDetails(null)).toBe('{"value":null,"tampered":true}');
    expect(tamperedDetails('7')).toBe('{"value":7,"tampered":true}');
    expect(tamperedDetails('oops')).toBe('{"original":"oops","tampered":true}');
  });
});

describe('rewriteChain (D81: the attack the hash chain alone cannot see)', () => {
  /** Three stored rows as Prisma returns them, chained the way withAudit writes them. */
  function storedRows() {
    let prev = GENESIS_HASH;
    return [1, 2, 3].map((id) => {
      const created_at = new Date(`2026-11-05T10:0${id}:00.000Z`);
      const row = {
        id,
        actor: 'admin',
        action: 'asset.noted',
        entity_type: 'asset',
        entity_id: `ebike-00${id}`,
        details_json: `{"n":${id}}`,
        created_at,
        prev_hash: prev,
      };
      row.hash = hashAuditEntry(prev, {
        actor: row.actor,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        details: { n: id },
        createdAt: created_at.toISOString(),
      });
      prev = row.hash;
      return row;
    });
  }

  it('leaves a chain that the hash walk alone accepts again', () => {
    const rows = storedRows();
    const { updates, headHash } = rewriteChain(rows, 2, '{"n":2,"tampered":true}', hashAuditEntry);
    expect(updates.map((u) => u.id)).toEqual([2, 3]);
    expect(updates[0].prev_hash).toBe(rows[0].hash);
    expect(updates[0].hash).not.toBe(rows[1].hash);
    const after = rows.map((row) => ({ ...row, ...updates.find((u) => u.id === row.id) }));
    const verdict = verifyAuditChain(
      after.map((row) => ({
        id: row.id,
        prevHash: row.prev_hash,
        hash: row.hash,
        actor: row.actor,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        details: JSON.parse(row.details_json),
        createdAt: row.created_at.toISOString(),
      })),
      { length: 3, hash: headHash }
    );
    expect(verdict).toEqual({ ok: true, length: 3, headHash });
  });

  it('refuses a row that is not there', () => {
    expect(() => rewriteChain(storedRows(), 9, '{}', hashAuditEntry)).toThrow('no audit row #9');
  });
});
