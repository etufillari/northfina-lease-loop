import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupAuthEnv } from './setup-auth.mjs';

let root;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'auth-env-'));
  writeFileSync(
    path.join(root, '.env.example'),
    'DATABASE_URL="file:./dev.db"\nBETTER_AUTH_SECRET=""\n'
  );
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('local authentication setup', () => {
  it('generates a random secret and retains it on subsequent runs', () => {
    setupAuthEnv(root);
    const first = readFileSync(path.join(root, '.env'), 'utf8');
    expect(first).toMatch(/BETTER_AUTH_SECRET="[A-Za-z0-9_-]{64}"/);
    expect(first).toContain('BETTER_AUTH_URL="http://localhost:3000"');
    setupAuthEnv(root);
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toBe(first);
  });

  it('preserves configured values and adds settings to an existing environment', () => {
    const original = 'DATABASE_URL="file:./mine.db"\nBETTER_AUTH_SECRET="configured-value"\n';
    writeFileSync(path.join(root, '.env'), original);
    setupAuthEnv(root);
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toContain(original);
  });
});
