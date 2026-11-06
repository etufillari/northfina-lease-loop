import { describe, expect, it } from 'vitest';
import {
  createStepTimer,
  decideInstall,
  formatDuration,
  interpretRobocopyExit,
  mainWorktreePath,
  parseWorktreeList,
  samePath,
} from './setup-worktree.mjs';

const PORCELAIN = [
  'worktree C:/Git/northfina-lease-loop',
  'HEAD 56ff7427f95e1d826d76dd8144b872a299bd6ea0',
  'branch refs/heads/main',
  '',
  'worktree C:/Git/northfina-lease-loop/.claude/worktrees/slot-a',
  'HEAD 0ae9cea8b1ff595e597b6fb7d341c0f08aa2803e',
  'detached',
  '',
].join('\n');

describe('parseWorktreeList', () => {
  it('reads every worktree with its HEAD and branch', () => {
    expect(parseWorktreeList(PORCELAIN)).toEqual([
      {
        path: 'C:/Git/northfina-lease-loop',
        head: '56ff7427f95e1d826d76dd8144b872a299bd6ea0',
        branch: 'refs/heads/main',
      },
      {
        path: 'C:/Git/northfina-lease-loop/.claude/worktrees/slot-a',
        head: '0ae9cea8b1ff595e597b6fb7d341c0f08aa2803e',
        branch: null,
      },
    ]);
  });

  it('accepts Windows line endings and paths with spaces', () => {
    const output = 'worktree C:/My Repos/lease loop\r\nHEAD abc\r\nbranch refs/heads/main\r\n';
    expect(parseWorktreeList(output)[0].path).toBe('C:/My Repos/lease loop');
  });

  it('returns nothing for empty output', () => {
    expect(parseWorktreeList('')).toEqual([]);
  });
});

describe('mainWorktreePath', () => {
  it('is the first worktree in the list', () => {
    expect(mainWorktreePath(PORCELAIN)).toBe('C:/Git/northfina-lease-loop');
  });

  it('is null when git printed no worktree', () => {
    expect(mainWorktreePath('\n')).toBeNull();
  });
});

describe('samePath', () => {
  it('ignores slash direction, a trailing slash and, on Windows, case', () => {
    expect(samePath('C:/Git/repo', 'c:\\Git\\repo\\', 'win32')).toBe(true);
  });

  it('keeps case on other platforms', () => {
    expect(samePath('/home/me/Repo', '/home/me/repo', 'linux')).toBe(false);
    expect(samePath('/home/me/repo/', '/home/me/repo', 'linux')).toBe(true);
  });

  it('tells a worktree from the main checkout', () => {
    expect(samePath('C:/Git/repo', 'C:/Git/repo/.claude/worktrees/a', 'win32')).toBe(false);
  });
});

describe('decideInstall', () => {
  const copyable = { isMain: false, mainHasModules: true, lockfilesEqual: true };

  it('copies when a second worktree has the same lockfile as a ready main checkout', () => {
    expect(decideInstall(copyable).action).toBe('copy');
  });

  it.each([
    [{ ...copyable, isMain: true }, 'this is the main checkout'],
    [{ ...copyable, mainHasModules: false }, 'the main checkout has no node_modules'],
    [{ ...copyable, lockfilesEqual: false }, 'package-lock.json differs from the main checkout'],
  ])('installs when %o', (facts, reason) => {
    expect(decideInstall(facts)).toEqual({ action: 'install', reason });
  });

  it('installs in the main checkout even when the other facts would allow a copy', () => {
    expect(
      decideInstall({ isMain: true, mainHasModules: false, lockfilesEqual: false }).reason
    ).toBe('this is the main checkout');
  });
});

describe('interpretRobocopyExit', () => {
  it.each([0, 1, 2, 3, 7])('exit code %i is a success', (code) => {
    expect(interpretRobocopyExit(code).ok).toBe(true);
  });

  it.each([8, 16])('exit code %i is a failure', (code) => {
    expect(interpretRobocopyExit(code)).toEqual({
      ok: false,
      message: `robocopy failed with exit code ${code}`,
    });
  });

  it.each([null, -1, 1.5])('%s (killed, timed out or nonsense) is a failure', (code) => {
    expect(interpretRobocopyExit(code).ok).toBe(false);
  });

  it('says when there was nothing to copy', () => {
    expect(interpretRobocopyExit(0).message).toMatch(/nothing to copy/);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0 ms'],
    [849.6, '850 ms'],
    [1000, '1.0 s'],
    [12_345, '12.3 s'],
    [60_000, '1 min 00 s'],
    [125_400, '2 min 05 s'],
  ])('%d ms reads %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe('createStepTimer', () => {
  /** A clock that moves forward by the given steps, one per call. */
  const fakeClock = (...ticks) => {
    let time = 0;
    let call = 0;
    return () => (time += ticks[call++] ?? 0);
  };

  it('records each step with its duration and returns the step result', () => {
    const timer = createStepTimer(fakeClock(0, 1500, 0, 250));
    expect(timer.run('copy', () => 'done')).toBe('done');
    timer.run('generate', () => undefined);
    expect(timer.steps()).toEqual([
      { label: 'copy', ms: 1500 },
      { label: 'generate', ms: 250 },
    ]);
    expect(timer.total()).toBe(1750);
  });

  it('records a step that throws and passes the error on', () => {
    const timer = createStepTimer(fakeClock(0, 40));
    expect(() =>
      timer.run('seed', () => {
        throw new Error('boom');
      })
    ).toThrow('boom');
    expect(timer.steps()).toEqual([{ label: 'seed', ms: 40 }]);
  });

  it('starts empty', () => {
    const timer = createStepTimer(() => 0);
    expect(timer.steps()).toEqual([]);
    expect(timer.total()).toBe(0);
  });
});
