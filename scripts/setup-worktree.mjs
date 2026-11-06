// Sets up a checkout so it can run the app and the checks: dependencies, the Prisma client,
// .env, the local database and the Git hooks.
// In a second worktree (for example an agent slot under .claude/worktrees/) it copies
// node_modules from the main checkout instead of downloading everything with `npm ci`,
// as long as both checkouts have the same package-lock.json byte for byte.
// Every child process has a time limit: the script fails with a message, it never hangs.
// Usage: npm run setup
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MINUTE = 60_000;
export const TIMEOUTS = { install: 15 * MINUTE, copy: 5 * MINUTE, other: 2 * MINUTE };

/**
 * Parses `git worktree list --porcelain`. Records are separated by blank lines;
 * the first record is always the main worktree.
 * @param {string} output
 * @returns {{ path: string, head: string | null, branch: string | null }[]}
 */
export function parseWorktreeList(output) {
  const worktrees = [];
  let current = null;
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length), head: null, branch: null };
      worktrees.push(current);
    } else if (current && line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length);
    } else if (current && line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length);
    }
  }
  return worktrees;
}

/** The main worktree's path, or null when the output names none. */
export function mainWorktreePath(output) {
  return parseWorktreeList(output)[0]?.path ?? null;
}

/**
 * True when two paths name the same folder. Git prints forward slashes; Node on Windows
 * gives back slashes and the drive letter case may differ.
 */
export function samePath(a, b, platform = process.platform) {
  const normalise = (p) => {
    const slashes = p.replace(/\\/g, '/').replace(/\/+$/, '');
    return platform === 'win32' ? slashes.toLowerCase() : slashes;
  };
  return normalise(a) === normalise(b);
}

/**
 * Copy node_modules from the main checkout, or run a clean install.
 * @param {{ isMain: boolean, mainHasModules: boolean, lockfilesEqual: boolean }} facts
 * @returns {{ action: 'copy' | 'install', reason: string }}
 */
export function decideInstall({ isMain, mainHasModules, lockfilesEqual }) {
  if (isMain) return { action: 'install', reason: 'this is the main checkout' };
  if (!mainHasModules)
    return { action: 'install', reason: 'the main checkout has no node_modules' };
  if (!lockfilesEqual) {
    return { action: 'install', reason: 'package-lock.json differs from the main checkout' };
  }
  return { action: 'copy', reason: 'same package-lock.json as the main checkout' };
}

/**
 * Robocopy's exit code is a bit field: 0–7 mean the copy worked (1 = files copied,
 * 2 = extra files at the destination, 4 = mismatches), 8 and above mean a failure.
 * @param {number | null} code
 * @returns {{ ok: boolean, message: string }}
 */
export function interpretRobocopyExit(code) {
  if (code === null || !Number.isInteger(code) || code < 0) {
    return { ok: false, message: 'robocopy did not finish (killed or timed out)' };
  }
  if (code >= 8) return { ok: false, message: `robocopy failed with exit code ${code}` };
  if (code === 0) return { ok: true, message: 'nothing to copy, already up to date' };
  return { ok: true, message: `copied (robocopy exit code ${code})` };
}

/** "850 ms", "12.3 s" or "2 min 05 s". */
export function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < MINUTE) return `${(ms / 1000).toFixed(1)} s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`;
}

/**
 * Times named steps. `now` returns milliseconds and is passed in so tests control the clock.
 * A step that throws is still recorded, then the error is passed on.
 */
export function createStepTimer(now) {
  const steps = [];
  return {
    run(label, fn) {
      const start = now();
      try {
        return fn();
      } finally {
        steps.push({ label, ms: now() - start });
      }
    },
    steps: () => steps.map((step) => ({ ...step })),
    total: () => steps.reduce((sum, step) => sum + step.ms, 0),
  };
}

// ---------------------------------------------------------------- I/O below this line

/** Runs a command with inherited output; turns a timeout or failure into a clear error. */
function run(label, command, args, timeout, options = {}) {
  try {
    return execFileSync(command, args, { stdio: 'inherit', timeout, ...options });
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.signal) {
      throw new Error(
        `${label} did not finish within ${formatDuration(timeout)} and was stopped.`,
        {
          cause: error,
        }
      );
    }
    throw new Error(`${label} failed (exit code ${error.status ?? 'unknown'}).`, { cause: error });
  }
}

/** npm's own CLI script, so no shell is needed on Windows (npm.cmd cannot run without one). */
function npmCommand() {
  const candidates = [
    process.env.npm_execpath,
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  const cli = candidates.find((path) => path && path.endsWith('.js') && existsSync(path));
  if (cli) return { command: process.execPath, prefix: [cli], shell: false };
  return { command: 'npm', prefix: [], shell: process.platform === 'win32' };
}

function npm(label, args, timeout) {
  const { command, prefix, shell } = npmCommand();
  run(label, command, [...prefix, ...args], timeout, { shell });
}

function prisma(label, args) {
  const cli = join('node_modules', 'prisma', 'build', 'index.js');
  // The seed command (`tsx prisma/seed.ts`) needs node_modules/.bin on the PATH, as under npm run.
  const bin = resolve('node_modules', '.bin');
  // On Windows the variable is usually spelled Path; keep one key, whatever its case.
  const key = Object.keys(process.env).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH';
  // CHECKPOINT_DISABLE skips Prisma's update check, a network call on every command.
  const env = {
    ...process.env,
    CHECKPOINT_DISABLE: '1',
    [key]: `${bin}${delimiter}${process.env[key] ?? ''}`,
  };
  run(label, process.execPath, [cli, ...args], TIMEOUTS.other, { env });
}

function copyModules(source, target) {
  if (process.platform !== 'win32') {
    cpSync(source, target, { recursive: true });
    return 'copied with fs.cpSync';
  }
  const args = [source, target, '/E', '/MT:16', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'];
  let code = 0;
  try {
    execFileSync('robocopy', [...args, '/R:1', '/W:1'], {
      stdio: 'inherit',
      timeout: TIMEOUTS.copy,
    });
  } catch (error) {
    // execFileSync throws on any non-zero exit, but robocopy uses 1–7 for success.
    code = error.code === 'ETIMEDOUT' || error.signal ? null : error.status;
  }
  const result = interpretRobocopyExit(code);
  if (!result.ok) {
    throw new Error(
      `Copying node_modules: ${result.message} (limit ${formatDuration(TIMEOUTS.copy)}).`
    );
  }
  return result.message;
}

function hooksActive(root) {
  let hooksPath;
  try {
    hooksPath = execFileSync('git', ['config', 'core.hooksPath'], {
      encoding: 'utf8',
      timeout: TIMEOUTS.other,
    }).trim();
  } catch {
    hooksPath = ''; // unset: git exits with 1
  }
  // core.hooksPath is shared by every worktree, but .husky/_ is git-ignored and per folder.
  return hooksPath === '.husky/_' && existsSync(join(root, '.husky', '_', 'h'));
}

function main() {
  const root = process.cwd();
  const timer = createStepTimer(() => performance.now());

  const list = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    encoding: 'utf8',
    timeout: TIMEOUTS.other,
  });
  const mainPath = mainWorktreePath(list);
  if (!mainPath) throw new Error('git worktree list printed no worktree.');
  const mainRoot = resolve(mainPath);
  const isMain = samePath(mainRoot, root);
  const mainModules = join(mainRoot, 'node_modules');
  const ownLock = readFileSync(join(root, 'package-lock.json'));
  const mainLockPath = join(mainRoot, 'package-lock.json');
  const decision = decideInstall({
    isMain,
    mainHasModules: !isMain && existsSync(mainModules),
    lockfilesEqual: existsSync(mainLockPath) && ownLock.equals(readFileSync(mainLockPath)),
  });
  console.log(`📦 ${decision.action === 'copy' ? 'Copying' : 'Installing'}: ${decision.reason}.`);

  if (decision.action === 'copy') {
    timer.run('copy node_modules', () => {
      console.log(`   from ${mainModules}`);
      console.log(`   ${copyModules(mainModules, join(root, 'node_modules'))}`);
    });
  } else {
    timer.run('npm ci', () =>
      npm('npm ci', ['ci', '--prefer-offline', '--no-audit', '--no-fund'], TIMEOUTS.install)
    );
  }
  timer.run('prisma generate', () => prisma('prisma generate', ['generate']));
  timer.run('ensure .env', () =>
    run('ensure-env', process.execPath, ['scripts/ensure-env.mjs'], TIMEOUTS.other)
  );
  timer.run('prisma migrate deploy', () => prisma('prisma migrate deploy', ['migrate', 'deploy']));
  timer.run('prisma db seed', () => prisma('prisma db seed', ['db', 'seed']));
  timer.run('git hooks', () => {
    if (hooksActive(root)) {
      console.log('🪝 Git hooks already active.');
      return;
    }
    run('husky install', process.execPath, ['.husky/install.mjs'], TIMEOUTS.other);
    // The desktop app writes the main checkout's absolute hooks path into each worktree's
    // config.worktree, which overrides husky's shared setting; point this worktree at its own.
    if (!isMain && !hooksActive(root)) {
      run(
        'git config --worktree',
        'git',
        ['config', '--worktree', 'core.hooksPath', '.husky/_'],
        TIMEOUTS.other
      );
    }
    if (!hooksActive(root)) throw new Error('Git hooks are still not active after husky install.');
    console.log('🪝 Git hooks installed.');
  });

  console.log('\n⏱  Steps:');
  for (const { label, ms } of timer.steps())
    console.log(`   ${label.padEnd(24)} ${formatDuration(ms)}`);
  console.log(`   ${'total'.padEnd(24)} ${formatDuration(timer.total())}`);
  console.log('✅ Ready: npm run dev');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(`\n❌ Setup failed: ${error.message}`);
    process.exitCode = 1;
  }
}
