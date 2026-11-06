import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isGitEnvKey, withoutGitEnv } from './git-env.mjs';

const dirs = [];
const tempDir = () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'lease-loop-git-env-')));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const git = (env, dir, ...args) =>
  execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env }).trim();

/** A real repository with one commit, standing in for the repository running a hook. */
function decoyRepository() {
  const dir = tempDir();
  const env = withoutGitEnv();
  git(env, dir, 'init', '-q');
  writeFileSync(join(dir, 'README.md'), 'decoy\n');
  git(env, dir, 'add', '.');
  git(
    env,
    dir,
    '-c',
    'user.name=Decoy',
    '-c',
    'user.email=decoy@example.com',
    'commit',
    '-qm',
    'init'
  );
  // What Git exports to a hook started from a linked worktree.
  return { dir, hookEnv: { ...process.env, GIT_DIR: join(dir, '.git'), GIT_WORK_TREE: dir } };
}

describe('withoutGitEnv', () => {
  it('drops every GIT_* variable, keeps the rest and leaves the input unchanged', () => {
    const env = {
      GIT_DIR: 'a',
      GIT_WORK_TREE: 'b',
      GIT_INDEX_FILE: 'c',
      GITHUB_TOKEN: 't',
      PATH: 'p',
    };
    expect(withoutGitEnv(env)).toEqual({ GITHUB_TOKEN: 't', PATH: 'p' });
    expect(env.GIT_DIR).toBe('a');
    expect(isGitEnvKey('GIT_COMMON_DIR')).toBe(true);
    expect(isGitEnvKey('GITHUB_ACTIONS')).toBe(false);
  });

  it('shows the hazard: an inherited GIT_DIR overrides git -C', () => {
    const { dir, hookEnv } = decoyRepository();
    const fixture = tempDir();
    expect(git(hookEnv, fixture, 'rev-parse', '--absolute-git-dir')).toBe(join(dir, '.git'));
    // Without the hook's variables, the empty fixture folder is correctly "not a repository".
    const isolated = spawnSync('git', ['-C', fixture, 'rev-parse', '--absolute-git-dir'], {
      env: withoutGitEnv(hookEnv),
    });
    expect(isolated.status).not.toBe(0);
  });

  it('keeps a fixture repository away from the repository running the hook', () => {
    const { dir, hookEnv } = decoyRepository();
    const fixture = tempDir();
    const env = withoutGitEnv(hookEnv);
    git(env, fixture, 'init', '-q');
    git(env, fixture, 'config', 'user.name', 'Fixture');
    git(env, fixture, 'config', 'user.email', 'fixture@example.com');
    writeFileSync(join(fixture, 'file.txt'), 'fixture\n');
    git(env, fixture, 'add', '.');
    git(env, fixture, 'commit', '-qm', 'fixture');

    const clean = withoutGitEnv();
    expect(git(clean, fixture, 'rev-parse', '--absolute-git-dir')).toBe(join(fixture, '.git'));
    expect(git(clean, dir, 'config', '--get', 'core.bare')).toBe('false');
    const identity = spawnSync('git', ['-C', dir, 'config', '--local', '--get', 'user.name'], {
      env: clean,
    });
    expect(identity.status).toBe(1);
    expect(git(clean, dir, 'rev-list', '--count', 'HEAD')).toBe('1');
  });

  it('is applied to every test worker by tests/isolate-git-env.mjs', () => {
    expect(Object.keys(process.env).filter(isGitEnvKey)).toEqual([]);
  });
});
