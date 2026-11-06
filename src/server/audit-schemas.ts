// Zod schemas of the audit chain route (contract first, docs/features/audit-chain.md): the
// verdict of walking the hash chain, its signatures and its anchors (D36, D81). The row that
// uses it is in routes.ts.
import { z } from 'zod';

const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);

/** Base64 SPKI DER of the Ed25519 public key; null when no signing key is set. */
const publicKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9+/]+=*$/)
  .nullable();

/**
 * Why the log breaks: a row's prevHash or hash, no hash, a head that differs (D36); a missing
 * or wrong signature, an anchor outside the database that disagrees, or a damaged anchor line
 * (D81).
 */
export const auditChainBreakSchema = z.enum([
  'prev_hash_mismatch',
  'hash_mismatch',
  'unhashed_in_chain',
  'head_mismatch',
  'unsigned_in_chain',
  'signature_mismatch',
  'anchor_mismatch',
  'anchor_unreadable',
]);

/**
 * `GET /api/audit-log/verify`: intact with the row count, the head hash to copy as an anchor,
 * whether the signatures were checked and how far the anchors reach; or broken at the first
 * bad row's id (0 for a damaged anchor line). Both carry the public key that checks signatures.
 */
export const auditChainVerdictSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    length: z.number().int().nonnegative(),
    headHash: sha256HexSchema,
    signaturesChecked: z.boolean(),
    anchoredLength: z.number().int().nonnegative(),
    publicKey: publicKeySchema,
  }),
  z.object({
    ok: z.literal(false),
    brokenAt: z.number().int(),
    reason: auditChainBreakSchema,
    publicKey: publicKeySchema,
  }),
]);
