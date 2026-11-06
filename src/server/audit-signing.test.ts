// The audit log's signing key (docs/features/audit-chain.md, D81): Ed25519 from AUDIT_SIGNING_KEY,
// a base64 PKCS#8 key that lives in .env and never in the database. Keys are generated here, so
// no key is written in the repository.
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { auditSigner, SIGNING_KEY_ENV, signerFromKey } from './audit-signing';

const newKey = () =>
  generateKeyPairSync('ed25519')
    .privateKey.export({ format: 'der', type: 'pkcs8' })
    .toString('base64');

describe('signerFromKey', () => {
  it('signs a message so that its own check accepts it and a changed message fails', () => {
    const signer = signerFromKey(newKey());
    const signature = signer.sign('lease-loop/audit-row\nabc');
    expect(signature).toMatch(/^[A-Za-z0-9+/]{86}==$/); // 64 bytes
    expect(signer.check('lease-loop/audit-row\nabc', signature)).toBe(true);
    expect(signer.check('lease-loop/audit-row\nabd', signature)).toBe(false);
  });

  it('is deterministic: Ed25519 signs the same message the same way', () => {
    const signer = signerFromKey(newKey());
    expect(signer.sign('m')).toBe(signer.sign('m'));
  });

  it('refuses a signature from another key, and garbage, without throwing', () => {
    const mine = signerFromKey(newKey());
    const theirs = signerFromKey(newKey());
    expect(mine.check('m', theirs.sign('m'))).toBe(false);
    expect(mine.check('m', 'not base64 at all')).toBe(false);
    expect(mine.check('m', '')).toBe(false);
  });

  it('publishes the public key as base64 SPKI, which verifies without the private key', () => {
    const signer = signerFromKey(newKey());
    expect(signer.publicKey).toMatch(/^MCowBQYDK2VwAyEA[A-Za-z0-9+/]{43}=$/);
  });

  it('names the variable, never the key, when the key cannot be read', () => {
    expect(() => signerFromKey('bm90IGEga2V5')).toThrow(/AUDIT_SIGNING_KEY is not a base64/);
    const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 })
      .privateKey.export({ format: 'der', type: 'pkcs8' })
      .toString('base64');
    expect(() => signerFromKey(rsa)).toThrow(/not an Ed25519 key/);
  });
});

describe('auditSigner', () => {
  it('reads the key from the environment and is null when it is missing or empty', () => {
    expect(auditSigner({})).toBeNull();
    expect(auditSigner({ [SIGNING_KEY_ENV]: '  ' })).toBeNull();
    const key = newKey();
    const signer = auditSigner({ [SIGNING_KEY_ENV]: key });
    expect(signer?.publicKey).toBe(signerFromKey(key).publicKey);
    expect(auditSigner({ [SIGNING_KEY_ENV]: key })).toBe(signer); // read once per key
  });
});
