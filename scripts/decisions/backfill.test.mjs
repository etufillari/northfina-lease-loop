import { describe, expect, it } from 'vitest';
import { entryFor, parseSourceRecord, validateChanges, renderTable } from './model.mjs';
import { digest, reconcile } from './repository.mjs';

const repository = 'team/repo';
const original = (number = 7) => ({
  number,
  html_url: `https://github.com/${repository}/pull/${number}`,
  merged_at: '2026-11-05T16:48:32Z',
  merge_commit_sha: 'a'.repeat(40),
  base: { ref: 'main', repo: { full_name: repository } },
});
const source = 'docs/decisions/backfills/pr-7-authentication.json';
const evidence = 'reviewed ownership rules';
const input = {
  schemaVersion: 1,
  originalPrNumber: 7,
  evidenceFiles: [{ path: 'AUTHENTICATION.md', sha256: digest(evidence) }],
  decisions: [
    {
      category: 'Auth',
      decision: 'Verify ownership on the server so callers cannot choose an owner.',
    },
  ],
};
const json = (value = input) => JSON.stringify(value);
const api = (path) => {
  if (path === 'pulls/7') return original();
  if (path.startsWith('pulls/7/files')) return [{ filename: 'AUTHENTICATION.md', status: 'added' }];
  throw new Error(`Unexpected API call: ${path}`);
};
const rebuild = (overrides = {}) =>
  reconcile({
    repository,
    defaultBranch: 'main',
    sources: { [source]: json() },
    api,
    history: () => {
      throw new Error('Backfill must not use the later authoring commit');
    },
    readAt: (sha, path) => {
      expect(sha).toBe('a'.repeat(40));
      expect(path).toBe('AUTHENTICATION.md');
      return evidence;
    },
    ...overrides,
  });

describe('explicit historical backfill', () => {
  it('accepts retrospective wording with verified evidence and an original PR number', () => {
    const parsed = parseSourceRecord(json(), source);
    expect(parsed.originalPrNumber).toBe(7);
    expect(parsed.record.decisions).toEqual(input.decisions);
  });
  it.each([
    { ...input, originalPrNumber: 0 },
    { ...input, evidenceFiles: [] },
    { ...input, evidenceFiles: [{ path: '../secret', sha256: digest(evidence) }] },
    { ...input, evidenceFiles: [{ path: 'file\nname', sha256: digest(evidence) }] },
    { ...input, evidenceFiles: [{ path: 'AUTHENTICATION.md', sha256: 'bad' }] },
    { ...input, evidenceFiles: [...input.evidenceFiles, ...input.evidenceFiles] },
    { ...input, mergedAt: '2026-11-06' },
  ])('rejects invalid or author-assigned provenance', (value) => {
    expect(() => parseSourceRecord(json(value), source)).toThrow();
  });
  it('uses the original PR ID/date rather than the later backfill PR', () => {
    const index = rebuild();
    expect(index.records[0].prNumber).toBe(7);
    expect(index.records[0].decisions[0].id).toBe('D-7-01');
    expect(index.records[0].mergedAt).toBe('2026-11-05T16:48:32.000Z');
    expect(renderTable(index)).toContain('[D-7-01](https://github.com/team/repo/pull/7)');
    expect(rebuild()).toEqual(index);
  });
  it('rejects unmerged origins and evidence absent from the original PR', () => {
    expect(() =>
      rebuild({ api: (path) => (path === 'pulls/7' ? { ...original(), merged_at: null } : []) })
    ).toThrow('must be merged');
    expect(() => rebuild({ api: (path) => (path === 'pulls/7' ? original() : []) })).toThrow(
      'evidence does not match'
    );
    expect(() => rebuild({ readAt: () => 'modified evidence' })).toThrow('evidence does not match');
  });
  it('allows multiple explicit historical records without relaxing the ordinary limit', () => {
    const sources = { [source]: json(), 'docs/decisions/backfills/pr-11-dashboard.json': '{}' };
    expect(validateChanges({}, sources)).toHaveLength(2);
    expect(() =>
      validateChanges(
        {},
        {
          ...sources,
          'docs/decisions/records/one.json': '{}',
          'docs/decisions/records/two.json': '{}',
        }
      )
    ).toThrow('no more than one');
    expect(() => validateChanges(sources, {})).toThrow('immutable');
  });
  it('preserves published IDs and places historical records in original merge order', () => {
    const normal = 'docs/decisions/records/original-log.json';
    const normalText = JSON.stringify({
      schemaVersion: 1,
      decisions: [
        {
          category: 'Process',
          decision: 'Use reviewed records because decisions need traceability.',
        },
      ],
    });
    const normalPr = { ...original(26), merged_at: '2026-11-06T01:10:30Z' };
    const expected = entryFor(
      normal,
      JSON.parse(normalText),
      digest(normalText),
      normalPr,
      repository,
      'main'
    );
    const combined = rebuild({
      sources: { [normal]: normalText, [source]: json() },
      history: () => 'b'.repeat(40),
      readAt: (_sha, file) => (file === normal ? normalText : evidence),
      api: (path) => {
        if (path.startsWith('commits/')) return [{ number: 26 }];
        if (path === 'pulls/26') return normalPr;
        if (path.startsWith('pulls/26/files')) return [{ filename: normal, status: 'added' }];
        return api(path);
      },
    });
    expect(combined.records.map((record) => record.prNumber)).toEqual([7, 26]);
    expect(combined.records[1]).toEqual(expected);
    expect(combined.records[1].decisions[0].id).toBe('D-26-01');
  });
});
