import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  addEntry,
  canonicalMerge,
  entryFor,
  isRecordPath,
  parseIndex,
  parseRecord,
  recordAddedBy,
  renderTable,
  serializeIndex,
  validateChanges,
} from './model.mjs';
import { reconcile } from './repository.mjs';

const repo = 'team/lease-loop';
const source = 'docs/decisions/records/shared-navigation.json';
const hash = 'a'.repeat(64);
const record = {
  schemaVersion: 1,
  decisions: [
    { category: 'UI', decision: 'Share navigation because pages need consistent controls.' },
    { category: 'Contract', decision: 'Lock the net rent because a signed lease must be stable.' },
  ],
};
const pr = (number = 21, merged_at = '2026-11-06T12:00:00Z', ref = 'main') => ({
  number,
  html_url: `https://github.com/${repo}/pull/${number}`,
  merged_at,
  base: { ref, repo: { full_name: repo } },
  merge_commit_sha: String(number).padStart(40, '0'),
});
const empty = () => ({ schemaVersion: 1, records: [] });
const entry = (number = 21, date, path = source) =>
  entryFor(path, record, hash, pr(number, date), repo, 'main');

describe('reviewed input', () => {
  it('accepts the schema and the single category configuration', () => {
    expect(parseRecord(JSON.stringify(record))).toEqual(record);
    for (const category of CATEGORIES)
      expect(
        parseRecord(
          JSON.stringify({
            schemaVersion: 1,
            decisions: [{ category, decision: 'Choose this because it works.' }],
          })
        )
      ).toBeTruthy();
  });
  it.each([
    '{',
    '{}',
    JSON.stringify({ ...record, schemaVersion: 2 }),
    JSON.stringify({ ...record, decisions: [] }),
    JSON.stringify({ ...record, extra: 'no' }),
    ...['unknown', '', 'Process\nUI'].map((category) =>
      JSON.stringify({ schemaVersion: 1, decisions: [{ category, decision: 'text' }] })
    ),
    ...['', ' ', ' first', 'two\nlines', 'two\rlines', 'two\u2028lines', 'two\tparts'].map(
      (decision) =>
        JSON.stringify({ schemaVersion: 1, decisions: [{ category: 'Process', decision }] })
    ),
  ])('rejects invalid record %s', (text) => {
    expect(() => parseRecord(text)).toThrow();
  });
  it('rejects traversal, nested, non-JSON or ambiguous filenames', () => {
    expect(isRecordPath(source)).toBe(true);
    for (const path of [
      '../bad.json',
      'docs/decisions/records/a/b.json',
      'docs/decisions/records/A.json',
      'docs/decisions/records/a.txt',
    ])
      expect(isRecordPath(path)).toBe(false);
  });
  it('permits zero or one record, but not multiple records', () => {
    expect(validateChanges({}, {})).toEqual([]);
    expect(validateChanges({}, { [source]: 'text' })).toEqual([source]);
    expect(() => validateChanges({}, { [source]: 'text', other: 'text' })).toThrow(
      'no more than one'
    );
  });
  it('freezes merged sources even before the publication index catches up', () => {
    const base = { [source]: 'reviewed' };
    for (const current of [{}, { [source]: 'changed' }, { renamed: 'reviewed' }])
      expect(() => validateChanges(base, current)).toThrow('immutable');
    expect(validateChanges(base, base)).toEqual([]);
  });
});

describe('stable publication metadata', () => {
  it('assigns D-21-01/02 linking to the same original PR', () => {
    const result = entry();
    expect(result.decisions.map((d) => d.id)).toEqual(['D-21-01', 'D-21-02']);
    expect(result.prUrl).toBe('https://github.com/team/lease-loop/pull/21');
    const table = renderTable(addEntry(empty(), result));
    for (const id of ['D-21-01', 'D-21-02']) expect(table).toContain(`[${id}](${result.prUrl})`);
  });
  it('pads only the decision number and supports decision 100', () => {
    const many = {
      schemaVersion: 1,
      decisions: Array.from({ length: 100 }, () => record.decisions[0]),
    };
    const result = entryFor(source, many, hash, pr(), repo, 'main');
    expect(result.decisions[99].id).toBe('D-21-100');
    expect(result.decisions[0].id).toBe('D-21-01');
  });
  it('uses the actual UTC merge date across a timezone boundary', () => {
    const result = entry(21, '2026-11-06T00:30:00+02:00');
    expect(result.mergedAt).toBe('2026-11-05T22:30:00.000Z');
    expect(renderTable(addEntry(empty(), result))).toContain('| 2026-11-05 |');
  });
  it('ignores unmerged closures and merges into another base or repository', () => {
    for (const value of [
      pr(21, null),
      pr(21, undefined, 'feature'),
      { ...pr(), base: { ref: 'main', repo: { full_name: 'other/repo' } } },
    ]) {
      expect(canonicalMerge(value, repo, 'main')).toBeNull();
      expect(
        recordAddedBy(value, [{ filename: source, status: 'added' }], repo, 'main')
      ).toBeNull();
    }
  });
  it('treats publication-only or no-record PRs as no-ops', () => {
    expect(recordAddedBy(pr(), [], repo, 'main')).toBeNull();
    expect(
      recordAddedBy(pr(), [{ filename: 'docs/DECISIONS.md', status: 'modified' }], repo, 'main')
    ).toBeNull();
    expect(
      recordAddedBy(pr(), [{ filename: source, status: 'modified' }], repo, 'main')
    ).toBeNull();
  });
  it('ignores the empty-directory marker when finding a new record', () => {
    expect(
      recordAddedBy(
        pr(),
        [
          { filename: 'docs/decisions/records/.gitkeep', status: 'added' },
          { filename: source, status: 'added' },
        ],
        repo,
        'main'
      )
    ).toBe(source);
  });
  it('rejects multiple added records and invalid originating URLs', () => {
    expect(() =>
      recordAddedBy(
        pr(),
        [source, 'docs/decisions/records/other.json'].map((filename) => ({
          filename,
          status: 'added',
        })),
        repo,
        'main'
      )
    ).toThrow('no more than one');
    expect(() =>
      canonicalMerge({ ...pr(), html_url: 'https://evil.test/pull/21' }, repo, 'main')
    ).toThrow('URL');
    expect(() => canonicalMerge({ ...pr(), merged_at: 'bad-date' }, repo, 'main')).toThrow(
      'timestamp'
    );
  });
  it('is idempotent and never changes a published association or decision', () => {
    const first = addEntry(empty(), entry());
    expect(addEntry(first, entry())).toBe(first);
    for (const altered of [
      { ...entry(), mergedAt: '2027-01-01T00:00:00.000Z' },
      { ...entry(), sha256: 'b'.repeat(64) },
    ])
      expect(() => addEntry(first, altered)).toThrow('history changed');
    expect(() =>
      addEntry(first, entry(21, undefined, 'docs/decisions/records/other.json'))
    ).toThrow('one record');
  });
  it('sorts by full timestamp, then PR, retaining decision order and IDs', () => {
    let index = addEntry(
      empty(),
      entry(22, '2026-11-06T12:00:00Z', 'docs/decisions/records/later.json')
    );
    index = addEntry(index, entry());
    index = addEntry(
      index,
      entry(99, '2026-11-05T12:00:00Z', 'docs/decisions/records/earlier.json')
    );
    expect(index.records.map((r) => r.prNumber)).toEqual([99, 21, 22]);
    expect(index.records[1].decisions[1].id).toBe('D-21-02');
  });
  it('round trips durable metadata and rejects forged IDs or invalid categories', () => {
    const index = addEntry(empty(), entry());
    expect(parseIndex(serializeIndex(index), repo, 'main')).toEqual(index);
    for (const text of [
      serializeIndex(index).replace('D-21-01', 'D-021-01'),
      serializeIndex(index).replace('"UI"', '"Bad"'),
      'null',
    ])
      expect(() => parseIndex(text, repo, 'main')).toThrow();
  });
  it('keeps the exact four columns and escapes table-breaking markup', () => {
    const input = {
      schemaVersion: 1,
      decisions: [
        {
          category: 'UI',
          decision: 'Use | <script> & [link](https://evil.test) `code` because text is untrusted.',
        },
      ],
    };
    const table = renderTable(addEntry(empty(), entryFor(source, input, hash, pr(), repo, 'main')));
    const rows = table.split('\n').filter((line) => line.startsWith('|'));
    expect(rows).toHaveLength(3);
    expect(rows.every((line) => line.split('|').length === 6)).toBe(true);
    expect(rows[0]).toBe('| Decision ID | Date | Category | Decision |');
    expect(table).not.toContain('<script>');
    expect(table).toContain('&#124;');
    expect(table).toContain('&#60;script&#62;');
    expect(table).not.toContain('[link]');
  });
  it('preserves a superseded row and a new explicit reference', () => {
    const next = {
      schemaVersion: 1,
      decisions: [
        {
          category: 'UI',
          decision:
            'Supersede D-21-01 with separate navigation because customers need different controls.',
        },
      ],
    };
    const index = addEntry(
      addEntry(empty(), entry()),
      entryFor('docs/decisions/records/new-navigation.json', next, hash, pr(22), repo, 'main')
    );
    expect(index.records[0].decisions[0].id).toBe('D-21-01');
    expect(index.records[1].decisions[0].decision).toContain('Supersede D-21-01');
  });
});

describe('reconciliation after concurrent, delayed or failed publication', () => {
  const one = 'docs/decisions/records/first.json';
  const two = 'docs/decisions/records/second.json';
  const text = JSON.stringify(record);
  const commits = { [one]: '1'.repeat(40), [two]: '2'.repeat(40) };
  const calls = [];
  const api = (path) => {
    calls.push(path);
    if (path.startsWith('commits/')) return [{ number: path.includes(commits[one]) ? 21 : 22 }];
    if (path === 'pulls/21') return pr(21, '2026-11-05T23:00:00Z');
    if (path === 'pulls/22') return pr(22);
    if (path.startsWith('pulls/21/files')) return [{ filename: one, status: 'added' }];
    if (path.startsWith('pulls/22/files')) return [{ filename: two, status: 'added' }];
    throw new Error(`Unexpected request ${path}`);
  };
  const rebuild = (sources, overrides = {}) =>
    reconcile({
      repository: repo,
      defaultBranch: 'main',
      sources,
      api,
      history: (name) => commits[name],
      readAt: () => text,
      ...overrides,
    });
  it('reconciles all pending records, including a delayed earlier merge', () => {
    const firstRun = rebuild({ [one]: text });
    const finalRun = rebuild({ [two]: text, [one]: text });
    expect(finalRun.records.map((r) => r.prNumber)).toEqual([21, 22]);
    expect(finalRun.records[0]).toEqual(firstRun.records[0]);
    expect(finalRun).toEqual(rebuild({ [one]: text, [two]: text }));
  });
  it('recovers identical IDs and dates after a failed publication or lost index', () => {
    const original = rebuild({ [one]: text, [two]: text });
    const recovered = rebuild({ [two]: text, [one]: text });
    expect(serializeIndex(recovered)).toBe(serializeIndex(original));
    expect(renderTable(recovered)).toBe(renderTable(original));
    expect(recovered.records[0].prNumber).toBe(21);
  });
  it('has no API calls or rows when no source records exist', () => {
    calls.length = 0;
    expect(rebuild({})).toEqual(empty());
    expect(calls).toEqual([]);
  });
  it('fails instead of guessing an origin or accepting modified reviewed content', () => {
    expect(() => rebuild({ [one]: text }, { api: () => [] })).toThrow('uniquely');
    expect(() => rebuild({ [one]: text }, { readAt: () => 'changed' })).toThrow(
      'Reviewed source changed'
    );
    expect(() => rebuild({ [one]: text }, { history: () => '' })).toThrow('addition commit');
  });
});
