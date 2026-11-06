// Add missing local auth settings without printing secrets or replacing configured values.
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureEnvFile } from './ensure-env.mjs';

export function setupAuthEnv(root) {
  ensureEnvFile(root);
  const file = join(root, '.env');
  let contents = readFileSync(file, 'utf8');
  for (const [key, value] of [
    ['BETTER_AUTH_URL', 'http://localhost:3000'],
    ['BETTER_AUTH_SECRET', randomBytes(48).toString('base64url')],
  ]) {
    const pattern = new RegExp(`^${key}=(.*)$`, 'm');
    const current = contents.match(pattern);
    if (!current) contents += `\n${key}="${value}"\n`;
    else if (['', '""', "''"].includes(current[1].trim())) {
      contents = contents.replace(pattern, `${key}="${value}"`);
    }
  }
  writeFileSync(file, contents, { mode: 0o600 });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  setupAuthEnv(process.cwd());
  console.log('Local authentication settings are ready. Secrets were not displayed.');
}
