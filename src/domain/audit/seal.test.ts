// The sealed audit chain (docs/features/audit-chain.md, D81): every row's hash and the stored
// head are signed with a key kept outside the database, and the head is copied to an anchor
// file outside it. These tests prove the attack D36 could not catch, a rewrite of both tables
// with fresh hashes, now breaks the verdict. The signature check is a fake passed in, so the
// domain stays pure; the real Ed25519 check is tested in src/server/audit-signing.test.ts.
import { describe, expect, it } from 'vitest';
import { GENESIS_HASH, hashAuditEntry, type AuditChainEntry } from './chain';
import {
  formatAnchorLine,
  headSigningMessage,
  parseAnchorLines,
  rowSigningMessage,
  verifySealedChain,
  type SealedHead,
  type SealedRow,
  type SignatureCheck,
} from './seal';

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

/** A stand-in for the key: only the holder can write `sig(<message>)`. */
const fakeSign = (message: string) => `sig(${message})`;
const fakeCheck: SignatureCheck = (message, signature) => signature === fakeSign(message);

/** Rows chained and signed the way withAudit writes them, from `list`. */
function sealedChain(list: AuditChainEntry[], sign = fakeSign): SealedRow[] {
  let prevHash = GENESIS_HASH;
  return list.map((entry, index) => {
    const hash = hashAuditEntry(prevHash, entry);
    const row = {
      id: index + 1,
      prevHash,
      hash,
      signature: sign(rowSigningMessage(hash)),
      ...entry,
    };
    prevHash = hash;
    return row;
  });
}

function headOf(rows: SealedRow[], sign = fakeSign): SealedHead {
  const head = { length: rows.length, hash: rows.at(-1)?.hash ?? GENESIS_HASH };
  return { ...head, signature: sign(headSigningMessage(head)) };
}

/** One anchor per row, as withAudit appends them after each commit. */
const anchorsOf = (rows: SealedRow[]) => rows.map((row, i) => ({ length: i + 1, hash: row.hash! }));

describe('signing messages', () => {
  it('names what is signed, so a row signature can never pass as a head signature', () => {
    const hash = 'a'.repeat(64);
    expect(rowSigningMessage(hash)).toBe(`lease-loop/audit-row\n${hash}`);
    expect(headSigningMessage({ length: 3, hash })).toBe(`lease-loop/audit-head\n3\n${hash}`);
  });
});

describe('verifySealedChain', () => {
  it('passes an intact, signed and fully anchored chain', () => {
    const rows = sealedChain(entries);
    expect(
      verifySealedChain(rows, headOf(rows), { checkSignature: fakeCheck, anchors: anchorsOf(rows) })
    ).toEqual({
      ok: true,
      length: 3,
      headHash: rows[2]!.hash,
      signaturesChecked: true,
      anchoredLength: 3,
    });
  });

  it('passes an empty log with no head and no anchors', () => {
    expect(verifySealedChain([], null, { checkSignature: fakeCheck, anchors: [] })).toEqual({
      ok: true,
      length: 0,
      headHash: GENESIS_HASH,
      signaturesChecked: true,
      anchoredLength: 0,
    });
  });

  it('still reports the D36 breaks first: an edited row is hash_mismatch', () => {
    const rows = sealedChain(entries);
    rows[1] = { ...rows[1]!, details: { quoteId: 'Q-2' } };
    expect(
      verifySealedChain(rows, headOf(rows), { checkSignature: fakeCheck, anchors: [] })
    ).toEqual({ ok: false, brokenAt: 2, reason: 'hash_mismatch' });
  });

  // The attack D36 left open: edit row 2, then recompute every hash and the head. The chain is
  // consistent again, but nobody without the key can sign the new hashes.
  it('catches a rewrite of both tables with fresh hashes: signature_mismatch at the first new hash', () => {
    const honest = sealedChain(entries);
    const edited = [entries[0]!, { ...entries[1]!, details: { quoteId: 'Q-2' } }, entries[2]!];
    const forger = (message: string) => `forged(${message})`;
    const rewritten = sealedChain(edited, forger).map((row, i) =>
      // The forger keeps row 1's honest signature (its hash did not change) and the old ones.
      ({ ...row, signature: honest[i]!.signature })
    );
    expect(
      verifySealedChain(rewritten, headOf(rewritten, forger), {
        checkSignature: fakeCheck,
        anchors: [],
      })
    ).toEqual({ ok: false, brokenAt: 2, reason: 'signature_mismatch' });
  });

  it('catches the same rewrite with no key at all through the anchors outside the database', () => {
    const honest = sealedChain(entries);
    const edited = [entries[0]!, { ...entries[1]!, details: { quoteId: 'Q-2' } }, entries[2]!];
    const rewritten = sealedChain(edited);
    expect(
      verifySealedChain(rewritten, headOf(rewritten), {
        checkSignature: null,
        anchors: anchorsOf(honest),
      })
    ).toEqual({ ok: false, brokenAt: 2, reason: 'anchor_mismatch' });
  });

  it('breaks with unsigned_in_chain on a row whose signature was removed', () => {
    const rows = sealedChain(entries);
    rows[2] = { ...rows[2]!, signature: null };
    expect(
      verifySealedChain(rows, headOf(rows), { checkSignature: fakeCheck, anchors: [] })
    ).toEqual({ ok: false, brokenAt: 3, reason: 'unsigned_in_chain' });
  });

  it('breaks at the last row when the head is unsigned or its signature is forged', () => {
    const rows = sealedChain(entries);
    const options = { checkSignature: fakeCheck, anchors: [] };
    expect(verifySealedChain(rows, { ...headOf(rows), signature: null }, options)).toEqual({
      ok: false,
      brokenAt: 3,
      reason: 'unsigned_in_chain',
    });
    expect(verifySealedChain(rows, { ...headOf(rows), signature: 'sig(other)' }, options)).toEqual({
      ok: false,
      brokenAt: 3,
      reason: 'signature_mismatch',
    });
  });

  // Finding 11's hole under a forger: delete the newest row and write a shorter head. The head
  // is signed now, so the shorter head needs the key.
  it('catches a truncated tail with a rewritten head: the head signature does not match', () => {
    const rows = sealedChain(entries);
    const shorter = rows.slice(0, 2);
    const forgedHead = { length: 2, hash: shorter[1]!.hash!, signature: 'forged' };
    expect(
      verifySealedChain(shorter, forgedHead, { checkSignature: fakeCheck, anchors: [] })
    ).toEqual({ ok: false, brokenAt: 2, reason: 'signature_mismatch' });
  });

  it('catches a truncated tail through an anchor longer than the chain', () => {
    const rows = sealedChain(entries);
    const shorter = rows.slice(0, 2);
    expect(
      verifySealedChain(shorter, headOf(shorter), {
        checkSignature: null,
        anchors: anchorsOf(rows),
      })
    ).toEqual({ ok: false, brokenAt: 3, reason: 'anchor_mismatch' });
  });

  it('skips signatures when no key is configured and says so', () => {
    const rows = sealedChain(entries).map((row) => ({ ...row, signature: null }));
    const verdict = verifySealedChain(
      rows,
      { ...headOf(rows), signature: null },
      {
        checkSignature: null,
        anchors: [],
      }
    );
    expect(verdict).toEqual({
      ok: true,
      length: 3,
      headHash: rows[2]!.hash,
      signaturesChecked: false,
      anchoredLength: 0,
    });
  });

  // withAudit appends the anchor after the commit, so a crash between the two leaves the file
  // behind the log. That is a lag the page shows, not a break.
  it('reports how far the anchors reach when they lag behind, in any order', () => {
    const rows = sealedChain(entries);
    const anchors = [anchorsOf(rows)[1]!, anchorsOf(rows)[0]!];
    expect(
      verifySealedChain(rows, headOf(rows), { checkSignature: fakeCheck, anchors })
    ).toMatchObject({ ok: true, anchoredLength: 2 });
  });

  it('breaks with anchor_unreadable on a line that is not an anchor', () => {
    const rows = sealedChain(entries);
    expect(
      verifySealedChain(rows, headOf(rows), { checkSignature: fakeCheck, anchors: [null] })
    ).toEqual({ ok: false, brokenAt: 0, reason: 'anchor_unreadable' });
  });
});

describe('anchor lines', () => {
  const hash = 'b'.repeat(64);

  it('formats one JSON line per anchor and reads it back', () => {
    const line = formatAnchorLine({ length: 4, hash, at: '2026-11-06T08:00:00.000Z' });
    expect(line).toBe(`{"length":4,"hash":"${hash}","at":"2026-11-06T08:00:00.000Z"}`);
    expect(parseAnchorLines(`${line}\n`)).toEqual([{ length: 4, hash }]);
  });

  it('reads an empty file as no anchors and skips blank lines', () => {
    expect(parseAnchorLines('')).toEqual([]);
    expect(parseAnchorLines(`\n{"length":1,"hash":"${hash}"}\n\n`)).toEqual([{ length: 1, hash }]);
  });

  it('reads a line that is not an anchor as null, so the verifier can name it', () => {
    expect(
      parseAnchorLines(
        [
          'not json',
          '{"length":0,"hash":"' + hash + '"}',
          '{"length":2,"hash":"short"}',
          '[1]',
        ].join('\n')
      )
    ).toEqual([null, null, null, null]);
  });
});
