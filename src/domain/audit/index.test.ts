import { describe, expect, it } from 'vitest';
import * as audit from './index';

describe('src/domain/audit index', () => {
  it('exports the chain and the canonical form', () => {
    expect(audit.GENESIS_HASH).toHaveLength(64);
    expect(typeof audit.canonicalJson).toBe('function');
    expect(typeof audit.hashAuditEntry).toBe('function');
    expect(audit.verifyAuditChain([]).ok).toBe(true);
    expect(audit.verifySealedChain([], null, { checkSignature: null, anchors: [] }).ok).toBe(true);
    expect(audit.parseAnchorLines('')).toEqual([]);
  });
});
