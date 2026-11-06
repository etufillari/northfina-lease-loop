// I/O adapters. All Git/GitHub arguments are arrays, never interpolated shell commands.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RECORD_PREFIX,
  SOURCE_PREFIXES,
  BACKFILL_PREFIX,
  INDEX_PATH,
  TABLE_PATH,
  isRecordPath,
  parseRecord,
  parseSourceRecord,
  canonicalMerge,
  parseIndex,
  entryFor,
  addEntry,
  validateChanges,
  recordAddedBy,
  renderTable,
  serializeIndex,
} from './model.mjs';

export function git(...args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trimEnd();
}
export function github(repository) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid repository identity');
  return (path) =>
    JSON.parse(
      execFileSync('gh', ['api', `repos/${repository}${path ? `/${path}` : ''}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    );
}
export function paginated(api, path) {
  const results = [];
  for (let page = 1; ; page++) {
    const batch = api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error('Expected a paginated API list');
    results.push(...batch);
    if (batch.length < 100) return results;
  }
}
export function sourcesAt(ref) {
  const sources = {};
  for (const name of git('ls-tree', '-r', '--name-only', ref, '--', ...SOURCE_PREFIXES)
    .split('\n')
    .filter(Boolean)) {
    if (name === `${RECORD_PREFIX}.gitkeep`) continue;
    if (!isRecordPath(name)) throw new Error(`Invalid record path: ${name}`);
    sources[name] = execFileSync('git', ['show', `${ref}:${name}`], { encoding: 'utf8' });
  }
  return sources;
}
export function workingSources() {
  const sources = {};
  for (const prefix of SOURCE_PREFIXES) {
    if (!existsSync(prefix)) continue;
    for (const name of readdirSync(prefix)) {
      if (name === '.gitkeep') continue;
      const file = join(prefix, name);
      if (!isRecordPath(file) || !lstatSync(file).isFile())
        throw new Error(`Invalid record file: ${file}`);
      sources[file] = readFileSync(file, 'utf8');
    }
  }
  return sources;
}
export function digest(text) {
  return createHash('sha256').update(text).digest('hex');
}
export function loadState(repository, defaultBranch) {
  const sources = workingSources();
  for (const [name, text] of Object.entries(sources)) parseSourceRecord(text, name);
  const index = parseIndex(readFileSync(INDEX_PATH, 'utf8'), repository, defaultBranch);
  for (const entry of index.records) {
    if (!(entry.source in sources) || digest(sources[entry.source]) !== entry.sha256) {
      throw new Error(`Published source missing or changed: ${entry.source}`);
    }
    const parsed = parseSourceRecord(sources[entry.source], entry.source);
    if (parsed.originalPrNumber && parsed.originalPrNumber !== entry.prNumber)
      throw new Error('Backfill origin mismatch');
    const expected = entryFor(
      entry.source,
      parsed.record,
      entry.sha256,
      {
        number: entry.prNumber,
        html_url: entry.prUrl,
        merged_at: entry.mergedAt,
        base: { ref: defaultBranch, repo: { full_name: repository } },
      },
      repository,
      defaultBranch
    );
    if (JSON.stringify(expected) !== JSON.stringify(entry))
      throw new Error('Source and metadata disagree');
  }
  return { sources, index };
}
export function validateLocal(repository, defaultBranch, base) {
  const { sources, index } = loadState(repository, defaultBranch);
  if (base) {
    if (!/^[a-f0-9]{40}$/.test(base)) throw new Error('Base must be a full commit SHA');
    validateChanges(sourcesAt(base), sources);
    const old = git('ls-tree', '--name-only', base, '--', INDEX_PATH)
      ? parseIndex(git('show', `${base}:${INDEX_PATH}`), repository, defaultBranch)
      : { schemaVersion: 1, records: [] };
    for (const entry of old.records) {
      if (!index.records.some((current) => JSON.stringify(current) === JSON.stringify(entry))) {
        throw new Error('Published metadata cannot be rewritten or deleted');
      }
    }
  }
  if (readFileSync(TABLE_PATH, 'utf8') !== renderTable(index))
    throw new Error('Generated table is stale: run decisions:preview');
  return { sources, index };
}
export function reconcile({ repository, defaultBranch, sources, api, history, readAt }) {
  let index = { schemaVersion: 1, records: [] };
  const cached = new Map();
  for (const [source, text] of Object.entries(sources)) {
    const parsed = parseSourceRecord(text, source);
    if (source.startsWith(BACKFILL_PREFIX)) {
      const original = api(`pulls/${parsed.originalPrNumber}`);
      if (!canonicalMerge(original, repository, defaultBranch))
        throw new Error('Backfill origin must be merged into the default branch');
      if (!/^[a-f0-9]{40}$/.test(original.merge_commit_sha))
        throw new Error('Missing original merge SHA');
      const files = paginated(api, `pulls/${original.number}/files`);
      for (const evidence of parsed.evidenceFiles) {
        if (
          !files.some((file) => file.filename === evidence.path && file.status !== 'removed') ||
          digest(readAt(original.merge_commit_sha, evidence.path)) !== evidence.sha256
        ) {
          throw new Error(`Backfill evidence does not match original PR: ${evidence.path}`);
        }
      }
      index = addEntry(
        index,
        entryFor(source, parsed.record, digest(text), original, repository, defaultBranch)
      );
      continue;
    }
    const commit = history(source);
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error(`No original addition commit: ${source}`);
    const candidates = paginated(api, `commits/${commit}/pulls`);
    const matches = [];
    for (const candidate of candidates) {
      if (!cached.has(candidate.number)) {
        const pr = api(`pulls/${candidate.number}`);
        const files = paginated(api, `pulls/${candidate.number}/files`);
        cached.set(candidate.number, {
          pr,
          source: recordAddedBy(pr, files, repository, defaultBranch),
        });
      }
      const match = cached.get(candidate.number);
      if (match.source === source) matches.push(match.pr);
    }
    if (matches.length !== 1)
      throw new Error(`Cannot uniquely associate ${source} with its original merged PR`);
    const pr = matches[0];
    if (!/^[a-f0-9]{40}$/.test(pr.merge_commit_sha)) throw new Error('Missing merge commit SHA');
    if (readAt(pr.merge_commit_sha, source) !== text)
      throw new Error(`Reviewed source changed: ${source}`);
    index = addEntry(
      index,
      entryFor(source, parseRecord(text, source), digest(text), pr, repository, defaultBranch)
    );
  }
  return index;
}
export function reconcileRepository(repository, defaultBranch, sources) {
  return reconcile({
    repository,
    defaultBranch,
    sources,
    api: github(repository),
    history: (source) =>
      git('log', '--reverse', '--diff-filter=A', '--format=%H', 'HEAD', '--', source).split(
        '\n'
      )[0],
    readAt: (sha, source) =>
      execFileSync('git', ['show', `${sha}:${source}`], { encoding: 'utf8' }),
  });
}
export function writeGenerated(index) {
  const updates = [
    [INDEX_PATH, serializeIndex(index)],
    [TABLE_PATH, renderTable(index)],
  ];
  let changed = false;
  for (const [file, text] of updates) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== text) {
      writeFileSync(file, text);
      changed = true;
    }
  }
  return changed;
}
