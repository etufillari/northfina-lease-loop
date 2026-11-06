// The audit chain: canonical JSON, the row hash and the verifier (docs/features/audit-chain.md).
export { canonicalJson } from './canonical';
export { auditDetailLines, type AuditDetailLine } from './details';
export {
  GENESIS_HASH,
  hashAuditEntry,
  verifyAuditChain,
  type AuditChainBreak,
  type AuditChainEntry,
  type AuditChainHead,
  type AuditChainRow,
  type AuditChainVerdict,
} from './chain';
export {
  formatAnchorLine,
  headSigningMessage,
  parseAnchorLines,
  rowSigningMessage,
  verifySealedChain,
  type AuditAnchor,
  type AuditSealBreak,
  type AuditSealVerdict,
  type SealOptions,
  type SealedHead,
  type SealedRow,
  type SignatureCheck,
} from './seal';
