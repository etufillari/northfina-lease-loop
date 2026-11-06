import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureEnvFile, ensureSigningKey, newSigningKey } from './ensure-env.mjs';

let root;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'ensure-env-'));
  writeFileSync(path.join(root, '.env.example'), 'DATABASE_URL="file:./dev.db"\n');
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('ensureEnvFile', () => {
  it('copies .env.example to .env when .env is missing', () => {
    expect(ensureEnvFile(root)).toBe('created');
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toBe('DATABASE_URL="file:./dev.db"\n');
  });

  it('never overwrites an existing .env', () => {
    writeFileSync(path.join(root, '.env'), 'DATABASE_URL="file:./mine.db"\n');
    expect(ensureEnvFile(root)).toBe('exists');
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toBe('DATABASE_URL="file:./mine.db"\n');
  });
});

describe('ensureSigningKey (D81)', () => {
  const env = () => readFileSync(path.join(root, '.env'), 'utf8');
  const fixedKey = () => 'KEY123';

  it('fills the empty placeholder that .env.example carries', () => {
    writeFileSync(
      path.join(root, '.env'),
      'DATABASE_URL="x"\nAUDIT_SIGNING_KEY=""\nDEMO_TOOLS="1"\n'
    );
    expect(ensureSigningKey(root, fixedKey)).toBe('added');
    expect(env()).toBe('DATABASE_URL="x"\nAUDIT_SIGNING_KEY="KEY123"\nDEMO_TOOLS="1"\n');
  });

  it('appends a key to an older .env without the line, on a line of its own', () => {
    writeFileSync(path.join(root, '.env'), 'DATABASE_URL="x"');
    expect(ensureSigningKey(root, fixedKey)).toBe('added');
    expect(env()).toBe('DATABASE_URL="x"\nAUDIT_SIGNING_KEY="KEY123"\n');
  });

  it('never replaces a key that is there', () => {
    writeFileSync(path.join(root, '.env'), 'AUDIT_SIGNING_KEY="mine"\n');
    expect(ensureSigningKey(root, fixedKey)).toBe('exists');
    expect(env()).toBe('AUDIT_SIGNING_KEY="mine"\n');
  });

  it('generates a base64 PKCS#8 Ed25519 key by default', () => {
    expect(newSigningKey()).toMatch(/^MC4CAQAwBQYDK2VwBCIEI[A-Za-z0-9+/]{43}$/);
  });
});
