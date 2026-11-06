import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  BACKFILL_PREFIX,
  INDEX_PATH,
  parseIndex,
  renderTable,
  TABLE_PATH,
  serializeIndex,
} from './model.mjs';
import {
  git,
  sourcesAt,
  github,
  validateLocal,
  workingSources,
  reconcileRepository,
  writeGenerated,
} from './repository.mjs';

export function context(env = process.env) {
  // DECISIONS_REPOSITORY names the repository whose PRs the records come from. It is set when
  // the checks run elsewhere, e.g. on our judging PR upstream, where GITHUB_REPOSITORY is theirs.
  const remote =
    env.DECISIONS_REPOSITORY ??
    env.GITHUB_REPOSITORY ??
    git('remote', 'get-url', 'origin')
      .replace(/^git@github\.com:|^https:\/\/github\.com\//, '')
      .replace(/\.git$/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(remote)) throw new Error('Set GITHUB_REPOSITORY=owner/repo');
  return { repository: remote, defaultBranch: env.DECISIONS_DEFAULT_BRANCH ?? 'main' };
}
/** True when the records' repository is not the one running the checks (our judging PR). */
export function judgingRun(env = process.env) {
  return Boolean(
    env.DECISIONS_REPOSITORY &&
    env.GITHUB_REPOSITORY &&
    env.DECISIONS_REPOSITORY !== env.GITHUB_REPOSITORY
  );
}
export function main(args = process.argv.slice(2)) {
  const [mode = 'validate', ...flags] = args;
  const { repository, defaultBranch } = context();
  const base = flags.length ? flags[1] : undefined;
  if (flags.length && (flags.length !== 2 || flags[0] !== '--base'))
    throw new Error('Expected --base <full SHA>');
  if (mode === 'validate' && judgingRun()) {
    // Running on our judging PR in the organisers' repository: the PR carries our whole history,
    // so the one-PR rules (one new record, immutable base) don't apply. Each record was checked
    // by its own PR in our fork; here every record and the published table are checked against
    // the fork's merged PRs on GitHub.
    const { sources, index } = validateLocal(repository, defaultBranch);
    if (
      serializeIndex(index) !==
      serializeIndex(reconcileRepository(repository, defaultBranch, sources))
    )
      throw new Error('Metadata does not match original merged PRs');
    console.log(`Decision records and published history validated against ${repository}.`);
  } else if (mode === 'validate') {
    const { sources, index } = validateLocal(repository, defaultBranch, base);
    // Generated mappings in a PR must also be verified against GitHub, not merely self-consistent.
    if (base && git('diff', '--name-only', base, '--', INDEX_PATH)) {
      // This PR's own newly added record is unmerged; only baseline records can be published.
      const accepted = sourcesAt(base);
      // Explicit retrospective records may publish in the same reviewed backfill PR;
      // original dates, files and hashes still come from GitHub, never its author.
      for (const [name, text] of Object.entries(sources)) {
        if (name.startsWith(BACKFILL_PREFIX)) accepted[name] = text;
      }
      const expected = reconcileRepository(repository, defaultBranch, accepted);
      if (serializeIndex(index) !== serializeIndex(expected))
        throw new Error('Metadata does not match original merged PRs');
    }
    console.log('Decision records, historical immutability and generated table validated.');
  } else if (mode === 'preview') {
    const index = parseIndex(readFileSync(INDEX_PATH, 'utf8'), repository, defaultBranch);
    process.stdout.write(renderTable(index));
  } else if (mode === 'reconcile' || mode === 'reconcile:check') {
    const actual = github(repository)('');
    if (actual.default_branch !== defaultBranch)
      throw new Error('Set DECISIONS_DEFAULT_BRANCH to the repository default branch');
    const index = reconcileRepository(repository, defaultBranch, workingSources());
    if (mode === 'reconcile:check') {
      if (
        !existsSync(INDEX_PATH) ||
        readFileSync(INDEX_PATH, 'utf8') !== serializeIndex(index) ||
        !existsSync(TABLE_PATH) ||
        readFileSync(TABLE_PATH, 'utf8') !== renderTable(index)
      )
        throw new Error('Reconciliation needed');
    } else {
      console.log(
        writeGenerated(index)
          ? 'Generated decision metadata and table updated.'
          : 'Already reconciled; no changes.'
      );
    }
  } else throw new Error('Use validate, preview, reconcile or reconcile:check');
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
