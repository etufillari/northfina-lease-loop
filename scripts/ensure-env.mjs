// Creates .env from .env.example when .env is missing, then makes sure it holds the audit
// log's signing key (D81): a fresh Ed25519 key, generated here and written only to .env, which
// git ignores. Never overwrites an existing .env value.
// Usage: node scripts/ensure-env.mjs
import { generateKeyPairSync } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const KEY_LINE = /^AUDIT_SIGNING_KEY=(.*)$/m;

/**
 * @param {string} root folder that holds .env.example
 * @returns {'created' | 'exists'}
 */
export function ensureEnvFile(root) {
  const target = join(root, '.env');
  if (existsSync(target)) return 'exists';
  copyFileSync(join(root, '.env.example'), target);
  return 'created';
}

/** A new Ed25519 private key as base64 PKCS#8 DER, the form AUDIT_SIGNING_KEY takes. */
export function newSigningKey() {
  return generateKeyPairSync('ed25519')
    .privateKey.export({ format: 'der', type: 'pkcs8' })
    .toString('base64');
}

/**
 * Fills an empty `AUDIT_SIGNING_KEY=""` line of `root/.env`, or appends one, with a new key.
 * A key already there is kept: a new key would make every signed row read as forged.
 * @param {string} root folder that holds .env
 * @param {() => string} [makeKey]
 * @returns {'added' | 'exists'}
 */
export function ensureSigningKey(root, makeKey = newSigningKey) {
  const target = join(root, '.env');
  const text = readFileSync(target, 'utf8');
  const match = KEY_LINE.exec(text);
  if (match && match[1].replace(/["'\s]/g, '') !== '') return 'exists';
  const line = `AUDIT_SIGNING_KEY="${makeKey()}"`;
  const next = match
    ? text.replace(KEY_LINE, line)
    : `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}${line}\n`;
  writeFileSync(target, next);
  return 'added';
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = ensureEnvFile(process.cwd());
  console.log(result === 'created' ? '📝 Created .env from .env.example' : '✔ .env already exists');
  if (ensureSigningKey(process.cwd()) === 'added') {
    console.log('🔑 Added a new AUDIT_SIGNING_KEY to .env (never commit it)');
  }
}
