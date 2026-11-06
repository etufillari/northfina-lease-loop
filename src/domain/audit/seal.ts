// The sealed audit chain (docs/features/audit-chain.md, D81): two checks on top of the D36
// hash chain, each answering an attack the chain alone cannot see.
//
// 1. Signatures. Every row's hash and the stored head are signed with an Ed25519 key that is
//    kept outside the database (.env). Someone who rewrites both tables with fresh hashes has a
//    consistent chain again, but cannot sign the new hashes without the key.
// 2. Anchors. After each commit the head (length, hash) is appended to a file outside the
//    database. A rewrite or a truncated tail no longer matches the hash the file kept for that
//    length. The file may lag behind the log (the append follows the commit), never disagree.
//
// The domain does not touch a key: the signature check is a function passed in, so this file
// stays pure; src/server/audit-signing.ts supplies the real one.
import { verifyAuditChain, type AuditChainBreak, type AuditChainRow } from './chain';

/** A stored row with its signature over `rowSigningMessage(hash)`; null when none. */
export type SealedRow = AuditChainRow & { signature: string | null };

/** The stored head with its signature over `headSigningMessage`; null when none. */
export type SealedHead = { length: number; hash: string; signature: string | null };

/** One line of the anchor file: the log had `length` rows and the newest hash was `hash`. */
export type AuditAnchor = { length: number; hash: string };

/** True when `signature` was made over `message` with the log's key. */
export type SignatureCheck = (message: string, signature: string) => boolean;

export type SealOptions = {
  /** Null when no key is configured: signatures are not checked, and the verdict says so. */
  checkSignature: SignatureCheck | null;
  /** The anchor file's lines in file order; null for a line that is not an anchor. */
  anchors: readonly (AuditAnchor | null)[];
};

export type AuditSealBreak =
  | AuditChainBreak
  | 'unsigned_in_chain'
  | 'signature_mismatch'
  | 'anchor_mismatch'
  | 'anchor_unreadable';

export type AuditSealVerdict =
  | {
      ok: true;
      length: number;
      headHash: string;
      signaturesChecked: boolean;
      /** The longest anchor that matched; below `length` means the anchors lag, not a break. */
      anchoredLength: number;
    }
  | { ok: false; brokenAt: number; reason: AuditSealBreak };

/** What a row's signature covers. The prefix keeps a row signature from passing as a head's. */
export function rowSigningMessage(hash: string): string {
  return `lease-loop/audit-row\n${hash}`;
}

/** What the head's signature covers: the row count and the newest hash. */
export function headSigningMessage(head: { length: number; hash: string }): string {
  return `lease-loop/audit-head\n${head.length}\n${head.hash}`;
}

/**
 * The D36 walk first (prev hash, hash, stored head), then every row's signature and the
 * head's, then the anchors from the shortest up. The first failure is the verdict. `brokenAt`
 * is a row id, the id after the last row for a missing tail, and 0 for an unreadable anchor line.
 */
export function verifySealedChain(
  rows: readonly SealedRow[],
  storedHead: SealedHead | null,
  options: SealOptions
): AuditSealVerdict {
  const chain = verifyAuditChain(rows, storedHead);
  if (!chain.ok) return chain;
  const lastId = rows.at(-1)?.id ?? 0;

  const { checkSignature } = options;
  if (checkSignature) {
    for (const row of rows) {
      // verifyAuditChain has already refused a row without a hash.
      const broken = signatureBreak(checkSignature, rowSigningMessage(row.hash!), row.signature);
      if (broken) return { ok: false, brokenAt: row.id, reason: broken };
    }
    if (storedHead) {
      const message = headSigningMessage(storedHead);
      const broken = signatureBreak(checkSignature, message, storedHead.signature);
      if (broken) return { ok: false, brokenAt: lastId, reason: broken };
    }
  }

  if (options.anchors.some((anchor) => anchor === null)) {
    return { ok: false, brokenAt: 0, reason: 'anchor_unreadable' };
  }
  const anchors = (options.anchors as readonly AuditAnchor[])
    .slice()
    .sort((a, b) => a.length - b.length);
  let anchoredLength = 0;
  for (const anchor of anchors) {
    const row = rows[anchor.length - 1];
    if (!row) return { ok: false, brokenAt: lastId + 1, reason: 'anchor_mismatch' };
    if (row.hash !== anchor.hash) return { ok: false, brokenAt: row.id, reason: 'anchor_mismatch' };
    anchoredLength = anchor.length;
  }

  return {
    ok: true,
    length: chain.length,
    headHash: chain.headHash,
    signaturesChecked: checkSignature !== null,
    anchoredLength,
  };
}

function signatureBreak(
  check: SignatureCheck,
  message: string,
  signature: string | null
): 'unsigned_in_chain' | 'signature_mismatch' | null {
  if (signature === null) return 'unsigned_in_chain';
  return check(message, signature) ? null : 'signature_mismatch';
}

/** One anchor as the JSON line the file holds; `at` is the row's instant, for a person. */
export function formatAnchorLine(anchor: AuditAnchor & { at: string }): string {
  return JSON.stringify({ length: anchor.length, hash: anchor.hash, at: anchor.at });
}

/** The file's lines, blank ones skipped; a line that is not `{ length ≥ 1, hash }` is null. */
export function parseAnchorLines(text: string): (AuditAnchor | null)[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map(parseAnchorLine);
}

function parseAnchorLine(line: string): AuditAnchor | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const { length, hash } = value as Record<string, unknown>;
  if (!Number.isInteger(length) || (length as number) < 1) return null;
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) return null;
  return { length: length as number, hash };
}
