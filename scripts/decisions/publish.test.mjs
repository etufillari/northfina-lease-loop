import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validatePullRequest } from '../check-pr.mjs';
import {
  addEntry,
  entryFor,
  INDEX_PATH,
  TABLE_PATH,
  renderTable,
  serializeIndex,
} from './model.mjs';

const state = vi.hoisted(() => ({
  calls: [],
  ghCalls: [],
  remote: false,
  remoteMatches: false,
  existingPr: false,
  index: null,
  files: {},
  defaultBranch: 'main',
  prBody: '',
  failCreate: false,
}));
vi.mock('node:fs', () => ({
  readFileSync: (file) => state.files[file],
  existsSync: () => true,
  mkdtempSync: () => '/tmp/lease-loop-publish-test',
  writeFileSync: (_file, content) => {
    state.prBody = content;
  },
  rmSync: (file) => {
    state.calls.push(['removeTemp', file]);
  },
}));
vi.mock('node:child_process', () => ({
  execFileSync: (_bin, args) => {
    state.ghCalls.push(args);
    if (state.failCreate) throw new Error('PR creation failed');
    return '';
  },
  spawnSync: () => ({ stdout: '' }),
}));
vi.mock('./repository.mjs', () => ({
  git: (...args) => {
    state.calls.push(args);
    if (args[0] === 'ls-remote') return state.remote ? 'a'.repeat(40) : '';
    if (args[0] === 'show')
      return state.remoteMatches
        ? (args[1].endsWith(INDEX_PATH)
            ? serializeIndex(state.index)
            : renderTable(state.index)
          ).trimEnd()
        : 'old output';
    return '';
  },
  github: () => (path) =>
    path === ''
      ? { default_branch: state.defaultBranch }
      : state.existingPr
        ? [{ number: 50 }]
        : [],
  workingSources: () => ({}),
  reconcileRepository: () => state.index,
  writeGenerated: () => {
    state.calls.push(['writeGenerated']);
    return true;
  },
}));
import { publish } from './publish.mjs';

const empty = { schemaVersion: 1, records: [] };
const repository = 'team/repo';
const context = { repository, defaultBranch: 'main' };
const record = {
  schemaVersion: 1,
  decisions: [
    { category: 'Process', decision: 'Use records because reviews need a stable source.' },
  ],
};
const index = addEntry(
  empty,
  entryFor(
    'docs/decisions/records/review-policy.json',
    record,
    'a'.repeat(64),
    {
      number: 21,
      html_url: `https://github.com/${repository}/pull/21`,
      merged_at: '2026-11-06T00:00:00Z',
      base: { ref: 'main', repo: { full_name: repository } },
    },
    repository,
    'main'
  )
);

beforeEach(() => {
  Object.assign(state, {
    calls: [],
    ghCalls: [],
    remote: false,
    remoteMatches: false,
    existingPr: false,
    index,
    defaultBranch: 'main',
    prBody: '',
    failCreate: false,
    files: { [INDEX_PATH]: serializeIndex(empty), [TABLE_PATH]: renderTable(empty) },
  });
});
describe('rolling publication', () => {
  it('does not commit, push or create a PR when generated output is unchanged', () => {
    state.index = empty;
    publish(context);
    expect(
      state.calls.some(([command]) => ['commit', 'push', 'writeGenerated'].includes(command))
    ).toBe(false);
    expect(state.ghCalls).toEqual([]);
  });
  it('writes only generated files and pushes only the documentation branch', () => {
    publish(context);
    expect(state.calls).toContainEqual(['add', '--', INDEX_PATH, TABLE_PATH]);
    expect(state.calls).toContainEqual([
      'push',
      'origin',
      'HEAD:refs/heads/automation/decision-log',
    ]);
    expect(
      state.calls.some((args) => args.includes('--force') || args.includes('--no-verify'))
    ).toBe(false);
    expect(state.ghCalls[0].slice(0, 2)).toEqual(['pr', 'create']);
    expect(state.ghCalls[0]).toContain('--body-file');
    expect(state.prBody).not.toContain('- [ ]');
    expect(
      validatePullRequest({
        title: 'docs(decisions): publish accepted project decisions',
        body: state.prBody,
      })
    ).toEqual([]);
    expect(state.calls).toContainEqual(['removeTemp', '/tmp/lease-loop-publish-test']);
  });
  it('removes the temporary description file when PR creation fails', () => {
    state.failCreate = true;
    expect(() => publish(context)).toThrow('PR creation failed');
    expect(state.calls).toContainEqual(['removeTemp', '/tmp/lease-loop-publish-test']);
  });
  it('reuses a rolling PR and keeps stale branches as ancestors without force pushes', () => {
    state.remote = true;
    state.existingPr = true;
    publish(context);
    expect(state.calls).toContainEqual([
      'merge',
      '--strategy=ours',
      '--no-commit',
      '--no-ff',
      'refs/remotes/origin/automation/decision-log',
    ]);
    expect(state.ghCalls).toEqual([]);
  });
  it('recovers a failed PR creation after a successful push without duplicating commits', () => {
    state.remote = true;
    state.remoteMatches = true;
    publish(context);
    expect(
      state.calls.some(([command]) => ['commit', 'push', 'writeGenerated'].includes(command))
    ).toBe(false);
    expect(state.ghCalls).toHaveLength(1);
  });
  it('repeated runs on an already populated rolling branch make no duplicate PR or commit', () => {
    state.remote = true;
    state.remoteMatches = true;
    state.existingPr = true;
    publish(context);
    publish(context);
    expect(
      state.calls.some(([command]) => ['commit', 'push', 'writeGenerated'].includes(command))
    ).toBe(false);
    expect(state.ghCalls).toEqual([]);
  });
  it('refuses a non-default publication target before any git writes', () => {
    expect(() => publish({ repository, defaultBranch: 'feature' })).toThrow('default branch');
    expect(state.calls).toEqual([]);
  });
});
