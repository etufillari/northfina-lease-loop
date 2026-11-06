import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  addEntry,
  entryFor,
  renderTable,
  serializeIndex,
  INDEX_PATH,
  TABLE_PATH,
} from './model.mjs';
import { digest } from './repository.mjs';

describe('decision validation against the checked-out PR merge', () => {
  it('accepts already-merged records despite an old event base, while retaining new-record and immutability guards', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lease-loop-pr-baseline-'));
    // A fixture repository must not inherit a caller's Git index/worktree or global hooks.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
    );
    env.GIT_CONFIG_GLOBAL = '/dev/null';
    env.GIT_CONFIG_NOSYSTEM = '1';
    const git = (...args) =>
      execFileSync('git', ['-C', directory, ...args], {
        env,
        encoding: 'utf8',
        stdio: 'pipe',
      }).trim();
    const write = (file, contents) => {
      mkdirSync(dirname(join(directory, file)), { recursive: true });
      writeFileSync(join(directory, file), contents);
    };
    const commit = (message) => {
      git('add', '.');
      git('commit', '-qm', message);
      return git('rev-parse', 'HEAD');
    };
    const record = JSON.stringify({
      schemaVersion: 1,
      decisions: [
        {
          category: 'Process',
          decision: 'Use reviewed sources because history must be reproducible.',
        },
      ],
    });
    const one = 'docs/decisions/records/first-choice.json';
    const two = 'docs/decisions/records/second-choice.json';
    let index = { schemaVersion: 1, records: [] };
    try {
      git('init', '-q', '-b', 'main');
      git('config', 'user.name', 'Decision fixture');
      git('config', 'user.email', 'fixture@example.com');
      write(INDEX_PATH, serializeIndex(index));
      write(TABLE_PATH, renderTable(index));
      const eventBase = commit('docs(test): initial base');

      for (const [offset, source] of [one, two].entries()) {
        write(source, record);
        commit('docs(test): merge another accepted choice');
        index = addEntry(
          index,
          entryFor(
            source,
            JSON.parse(record),
            digest(record),
            {
              number: 21 + offset,
              html_url: `https://github.com/team/repo/pull/${21 + offset}`,
              merged_at: `2026-11-06T0${offset}:00:00Z`,
              base: { ref: 'main', repo: { full_name: 'team/repo' } },
            },
            'team/repo',
            'main'
          )
        );
      }
      const actualBase = git('rev-parse', 'HEAD');
      git('switch', '-qc', 'publication');
      write(INDEX_PATH, serializeIndex(index));
      write(TABLE_PATH, renderTable(index));
      commit('docs(test): publish the accepted history');
      git('switch', '-q', 'main');
      git('merge', '--no-ff', '-qm', 'docs(test): GitHub test merge', 'publication');

      const adapter = pathToFileURL(resolve('scripts/decisions/repository.mjs')).href;
      const validate = (base) =>
        spawnSync(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            `import {validateLocal} from ${JSON.stringify(adapter)}; try { validateLocal('team/repo','main',${JSON.stringify(base)}); } catch (error) { console.error(error.message); process.exitCode = 1; }`,
          ],
          { cwd: directory, env, encoding: 'utf8' }
        );

      expect(validate(eventBase).stderr).toContain('no more than one decision record');
      git('rev-parse', '--verify', 'HEAD^2');
      const checkedOutBase = git('rev-parse', 'HEAD^1');
      expect(checkedOutBase).toBe(actualBase);
      expect(validate(checkedOutBase).status).toBe(0);

      write('docs/decisions/records/third-choice.json', record);
      write('docs/decisions/records/fourth-choice.json', record);
      expect(validate(checkedOutBase).stderr).toContain('no more than one decision record');
      write(one, record.replace('reproducible', 'different'));
      expect(validate(checkedOutBase).stderr).toContain('Published source missing or changed');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
