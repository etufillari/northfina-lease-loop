import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { withoutGitEnv } from '../git-env.mjs';
import { renderTable } from './model.mjs';
import { paginated } from './repository.mjs';

describe('repository boundary', () => {
  it('paginates GitHub file lists beyond the first page', () => {
    const seen = [];
    const items = paginated((path) => {
      seen.push(path);
      return path.endsWith('page=1')
        ? Array.from({ length: 100 }, () => ({}))
        : [{ filename: 'last' }];
    }, 'pulls/21/files');
    expect(items).toHaveLength(101);
    expect(seen).toEqual([
      'pulls/21/files?per_page=100&page=1',
      'pulls/21/files?per_page=100&page=2',
    ]);
  });
  it('validates real git baselines, rollout without an old index, and immutable merged files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lease-loop-decisions-test-'));
    // Never inherit GIT_DIR & co. from a hook: they would redirect every command below to
    // the real repository (see scripts/git-env.mjs).
    const env = withoutGitEnv();
    const runGit = (...args) =>
      execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env }).trim();
    const adapter = pathToFileURL(resolve('scripts/decisions/repository.mjs')).href;
    try {
      runGit('init', '-q');
      runGit('config', 'user.name', 'Decision fixture');
      runGit('config', 'user.email', 'fixture@example.com');
      writeFileSync(join(dir, 'README.md'), 'fixture\n');
      runGit('add', '.');
      runGit('commit', '-qm', 'docs(test): baseline');
      const base = runGit('rev-parse', 'HEAD');
      mkdirSync(join(dir, 'docs/decisions/records'), { recursive: true });
      writeFileSync(join(dir, 'docs/decisions/records/.gitkeep'), '');
      writeFileSync(join(dir, 'docs/decisions/index.json'), '{"schemaVersion":1,"records":[]}');
      writeFileSync(join(dir, 'docs/DECISIONS.md'), renderTable({ schemaVersion: 1, records: [] }));
      const child = (script) =>
        execFileSync(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            `import {validateLocal,sourcesAt} from ${JSON.stringify(adapter)}; ${script}`,
          ],
          { cwd: dir, encoding: 'utf8', stdio: 'pipe', env }
        );
      expect(child(`validateLocal('team/repo','main','${base}'); console.log('valid');`)).toContain(
        'valid'
      );
      const record = join(dir, 'docs/decisions/records/choice.json');
      writeFileSync(
        record,
        '{"schemaVersion":1,"decisions":[{"category":"UI","decision":"Choose this because it is clear."}]}'
      );
      runGit('add', '.');
      runGit('commit', '-qm', 'docs(test): accepted record');
      const accepted = runGit('rev-parse', 'HEAD');
      expect(
        child(
          `validateLocal('team/repo','main','${accepted}'); console.log(Object.keys(sourcesAt('${accepted}')).length);`
        )
      ).toContain('1');
      writeFileSync(
        record,
        '{"schemaVersion":1,"decisions":[{"category":"UI","decision":"Changed history."}]}'
      );
      expect(() => child(`validateLocal('team/repo','main','${accepted}');`)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
