// Pure tooling rules. This is repository automation, not leasing business logic.
export const CATEGORIES = Object.freeze([
  'UI',
  'Contract',
  'API',
  'Database',
  'Auth',
  'Infrastructure',
  'Testing',
  'Process',
]);
export const RECORD_PREFIX = 'docs/decisions/records/';
export const BACKFILL_PREFIX = 'docs/decisions/backfills/';
export const SOURCE_PREFIXES = [RECORD_PREFIX, BACKFILL_PREFIX];
export const INDEX_PATH = 'docs/decisions/index.json';
export const TABLE_PATH = 'docs/DECISIONS.md';
export const GENERATED_PATHS = [INDEX_PATH, TABLE_PATH];

function exactKeys(value, keys, label) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  ) {
    throw new Error(`${label}: expected exactly ${keys.join(', ')}`);
  }
}
export function isRecordPath(path) {
  return /^docs\/decisions\/(?:records|backfills)\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(path);
}
export function parseRecord(text, name = 'record') {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${name}: invalid JSON`);
  }
  exactKeys(value, ['schemaVersion', 'decisions'], name);
  if (value.schemaVersion !== 1) throw new Error(`${name}: unsupported schemaVersion`);
  if (!Array.isArray(value.decisions) || value.decisions.length === 0) {
    throw new Error(`${name}: decisions must be a nonempty ordered list`);
  }
  for (const decision of value.decisions) {
    exactKeys(decision, ['category', 'decision'], name);
    if (!CATEGORIES.includes(decision.category)) throw new Error(`${name}: unknown category`);
    if (
      typeof decision.decision !== 'string' ||
      !decision.decision.trim() ||
      decision.decision !== decision.decision.trim() ||
      /[\p{Cc}\p{Zl}\p{Zp}]/u.test(decision.decision)
    ) {
      throw new Error(
        `${name}: decision must be nonempty, single-line text without surrounding whitespace`
      );
    }
  }
  return value;
}
/** Retrospective wording is reviewed now; evidence comes from the original PR. */
export function parseSourceRecord(text, source) {
  if (!source.startsWith(BACKFILL_PREFIX)) return { record: parseRecord(text, source) };
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${source}: invalid JSON`);
  }
  exactKeys(value, ['schemaVersion', 'originalPrNumber', 'evidenceFiles', 'decisions'], source);
  if (!Number.isSafeInteger(value.originalPrNumber) || value.originalPrNumber < 1) {
    throw new Error('Backfill requires a positive original PR number');
  }
  if (!Array.isArray(value.evidenceFiles) || value.evidenceFiles.length === 0) {
    throw new Error('Backfill requires original-merge evidence');
  }
  const paths = new Set();
  for (const evidence of value.evidenceFiles) {
    exactKeys(evidence, ['path', 'sha256'], 'evidence');
    if (
      typeof evidence.path !== 'string' ||
      !/^[A-Za-z0-9_./[\]-]+$/.test(evidence.path) ||
      evidence.path.startsWith('/') ||
      evidence.path.split('/').some((part) => !part || part === '..' || part === '.git') ||
      !/^[a-f0-9]{64}$/.test(evidence.sha256) ||
      paths.has(evidence.path)
    ) {
      throw new Error('Invalid or duplicate evidence path/digest');
    }
    paths.add(evidence.path);
  }
  return {
    originalPrNumber: value.originalPrNumber,
    evidenceFiles: value.evidenceFiles,
    record: parseRecord(
      JSON.stringify({ schemaVersion: value.schemaVersion, decisions: value.decisions }),
      source
    ),
  };
}
export function canonicalMerge(pr, repository, defaultBranch) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid repository identity');
  if (!pr.merged_at || pr.base?.ref !== defaultBranch || pr.base?.repo?.full_name !== repository)
    return null;
  if (
    !Number.isSafeInteger(pr.number) ||
    pr.number < 1 ||
    pr.html_url !== `https://github.com/${repository}/pull/${pr.number}`
  ) {
    throw new Error('Invalid originating PR URL or number');
  }
  if (
    typeof pr.merged_at !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(pr.merged_at) ||
    !Number.isFinite(Date.parse(pr.merged_at))
  )
    throw new Error('Invalid merge timestamp');
  return { number: pr.number, url: pr.html_url, mergedAt: new Date(pr.merged_at).toISOString() };
}
export function entryFor(source, record, sha256, pr, repository, defaultBranch) {
  const merge = canonicalMerge(pr, repository, defaultBranch);
  if (!merge) return null;
  if (!isRecordPath(source) || !/^[a-f0-9]{64}$/.test(sha256))
    throw new Error('Invalid source or digest');
  return {
    source,
    sha256,
    prNumber: merge.number,
    prUrl: merge.url,
    mergedAt: merge.mergedAt,
    decisions: record.decisions.map((decision, index) => ({
      id: `D-${merge.number}-${String(index + 1).padStart(2, '0')}`,
      ...decision,
    })),
  };
}
export function parseIndex(text, repository, defaultBranch) {
  let index;
  try {
    index = JSON.parse(text);
  } catch {
    throw new Error('Invalid metadata JSON');
  }
  exactKeys(index, ['schemaVersion', 'records'], 'index');
  if (index.schemaVersion !== 1 || !Array.isArray(index.records))
    throw new Error('Invalid metadata version/records');
  let result = { schemaVersion: 1, records: [] };
  for (const entry of index.records) {
    exactKeys(
      entry,
      ['source', 'sha256', 'prNumber', 'prUrl', 'mergedAt', 'decisions'],
      'index entry'
    );
    if (!Array.isArray(entry.decisions)) throw new Error('Invalid metadata decisions');
    for (const d of entry.decisions)
      exactKeys(d, ['id', 'category', 'decision'], 'metadata decision');
    const record = parseRecord(
      JSON.stringify({
        schemaVersion: 1,
        decisions: entry.decisions.map(({ category, decision }) => ({ category, decision })),
      })
    );
    const expected = entryFor(
      entry.source,
      record,
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
    if (!expected || JSON.stringify(entry) !== JSON.stringify(expected))
      throw new Error('Invalid assigned metadata or decision IDs');
    result = addEntry(result, expected);
  }
  return result;
}
export function addEntry(index, entry) {
  if (!entry) return index;
  const previous = index.records.find((record) => record.source === entry.source);
  if (previous) {
    if (JSON.stringify(previous) !== JSON.stringify(entry))
      throw new Error(`Published history changed: ${entry.source}`);
    return index;
  }
  if (index.records.some((record) => record.prNumber === entry.prNumber))
    throw new Error('More than one record for a PR');
  const records = [...index.records, entry].sort(
    (a, b) => a.mergedAt.localeCompare(b.mergedAt) || a.prNumber - b.prNumber
  );
  return { schemaVersion: 1, records };
}
export function validateChanges(baseSources, currentSources) {
  for (const [name, text] of Object.entries(baseSources)) {
    if (currentSources[name] !== text)
      throw new Error(`Merged decision records are immutable: ${name}`);
  }
  const added = Object.keys(currentSources).filter((name) => !(name in baseSources));
  if (added.filter((name) => !name.startsWith(BACKFILL_PREFIX)).length > 1)
    throw new Error('A PR may add no more than one decision record');
  return added;
}
export function recordAddedBy(pr, files, repository, defaultBranch) {
  if (!canonicalMerge(pr, repository, defaultBranch)) return null;
  const added = files.filter(
    (file) =>
      file.filename.startsWith(RECORD_PREFIX) &&
      file.filename !== `${RECORD_PREFIX}.gitkeep` &&
      file.status === 'added'
  );
  if (added.length > 1) throw new Error('A PR may add no more than one decision record');
  if (added[0] && !isRecordPath(added[0].filename)) throw new Error('Invalid record filename');
  return added[0]?.filename ?? null;
}
function escapeCell(text) {
  // Escape all Markdown/HTML punctuation as numeric entities, including pipes and backslashes.
  return text.replace(/[^\p{L}\p{N} ]/gu, (char) => `&#${char.codePointAt(0)};`);
}
export function renderTable(index) {
  const lines = [
    '# Project decisions',
    '',
    'Generated from reviewed decision records and merge metadata. Do not edit this table manually.',
    'See [the decision-log guide](decisions/README.md) for the contribution and publication workflow.',
    '',
    '<!-- prettier-ignore -->',
    '| Decision ID | Date | Category | Decision |',
    '|-------------|------|----------|----------|',
  ];
  for (const record of [...index.records].sort(
    (a, b) => a.mergedAt.localeCompare(b.mergedAt) || a.prNumber - b.prNumber
  )) {
    for (const d of record.decisions) {
      lines.push(
        `| [${d.id}](${record.prUrl}) | ${record.mergedAt.slice(0, 10)} | ${d.category} | ${escapeCell(d.decision)} |`
      );
    }
  }
  return `${lines.join('\n')}\n`;
}
export function serializeIndex(index) {
  return `${JSON.stringify(index, null, 2)}\n`;
}
