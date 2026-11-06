// Starts the built app (`npm run build` first) on its own fresh, seeded SQLite database in the
// temp folder, so a test run never touches dev.db.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sleep } from './browser.mjs';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

export async function startServer({ port = 3100 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'lease-loop-db-'));
  // Forward slashes: a file: URL with backslashes doesn't open on Windows.
  const databaseUrl = `file:${join(dir, 'e2e.db').replaceAll('\\', '/')}`;
  const env = { ...process.env, DATABASE_URL: databaseUrl };
  const run = (args) => execFileSync(npx, args, { env, stdio: 'ignore', shell: true });
  run(['prisma', 'migrate', 'deploy']);
  run(['prisma', 'db', 'seed']);

  const server = spawn(npx, ['next', 'start', '-p', String(port)], {
    env,
    stdio: 'ignore',
    shell: true,
  });
  const baseUrl = `http://localhost:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${baseUrl}/en`)).ok) break;
    } catch {
      // not up yet
    }
    await sleep(500);
  }

  return {
    baseUrl,
    async stop() {
      // `shell: true` puts the server under a shell; kill the whole tree.
      if (process.platform === 'win32') {
        try {
          execFileSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
        } catch {
          // already gone
        }
      } else {
        server.kill('SIGTERM');
      }
      await sleep(500);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
