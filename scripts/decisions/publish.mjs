// Executed only from the reviewed default-branch checkout, never a PR head.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { context } from './cli.mjs';
import { GENERATED_PATHS, INDEX_PATH, TABLE_PATH, renderTable, serializeIndex } from './model.mjs';
import { git, github, workingSources, reconcileRepository, writeGenerated } from './repository.mjs';

const BRANCH = 'automation/decision-log';
const PR_BODY = [
  '## Summary',
  '',
  'Publishes decisions already accepted in merged PRs so the central project history stays current. Original decision text, identifiers and merge dates are preserved.',
  '',
  '## Context',
  '',
  'Reviewed decision records are waiting to appear in the generated history on main. No linked issue; the table links each decision to its originating PR.',
  '',
  '## Description',
  '',
  'Update the generated metadata index and central table from accepted records. This publication introduces no new policy and remains pending until the documentation PR is merged.',
  '',
  '## Testing Instructions',
  '',
  'The publication workflow reconstructs the generated output from original merged PR metadata. Read the Actions results and compare the table/index with the accepted source records. For a local verification, run `npm run decisions:reconcile:check` on a clean checkout of this PR with GitHub read access.',
  '',
].join('\n');
function gh(...args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
export function publish({ repository, defaultBranch }) {
  const repo = github(repository)('');
  if (repo.default_branch !== defaultBranch)
    throw new Error('Publication requires the current default branch');
  // Always read the latest default branch. Pending jobs may have been replaced or delayed.
  git('fetch', 'origin', `refs/heads/${defaultBranch}:refs/remotes/origin/${defaultBranch}`);
  git('checkout', '-B', BRANCH, `refs/remotes/origin/${defaultBranch}`);
  const index = reconcileRepository(repository, defaultBranch, workingSources());
  const expected = [
    [INDEX_PATH, serializeIndex(index)],
    [TABLE_PATH, renderTable(index)],
  ];
  if (expected.every(([file, text]) => readFileSync(file, 'utf8') === text)) {
    console.log('No unpublished decisions or generated changes.');
    return;
  }
  const remote = git('ls-remote', '--heads', 'origin', `refs/heads/${BRANCH}`);
  if (remote) git('fetch', 'origin', `refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}`);
  const alreadyPushed =
    remote &&
    expected.every(
      ([file, text]) =>
        // git() trims trailing newlines; compare like for like.
        git('show', `refs/remotes/origin/${BRANCH}:${file}`) === text.trimEnd()
    );
  if (!alreadyPushed) {
    git('config', 'user.name', 'github-actions[bot]');
    git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');

    if (remote) {
      // Retain the prior bot branch as an ancestor without importing its stale tree.
      // Normal fast-forward pushes work after squash merges; no force pushes or stash needed.
      git('merge', '--strategy=ours', '--no-commit', '--no-ff', `refs/remotes/origin/${BRANCH}`);
    }
    writeGenerated(index);
    git('add', '--', ...GENERATED_PATHS);
    git('commit', '-m', 'docs(decisions): publish accepted project decisions');
    git('push', 'origin', `HEAD:refs/heads/${BRANCH}`);
  }

  const prs = github(repository)(
    `pulls?state=open&head=${encodeURIComponent(`${repository.split('/')[0]}:${BRANCH}`)}&base=${encodeURIComponent(defaultBranch)}`
  );
  if (prs.length > 1)
    throw new Error('More than one rolling publication PR; maintainer review required');
  if (prs.length === 0) {
    const directory = mkdtempSync(join(tmpdir(), 'lease-loop-decision-pr-'));
    const bodyFile = join(directory, 'body.md');
    try {
      writeFileSync(bodyFile, PR_BODY, { mode: 0o600 });
      gh(
        'pr',
        'create',
        '--repo',
        repository,
        '--base',
        defaultBranch,
        '--head',
        BRANCH,
        '--title',
        'docs(decisions): publish accepted project decisions',
        '--body-file',
        bodyFile
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  console.log(
    'Rolling decision-log PR updated; merge it to publish the table on the default branch.'
  );
}
if (process.argv[1]?.endsWith('/publish.mjs')) {
  try {
    publish(context());
  } catch (error) {
    // No retries against stale local state. A fresh run reconciles all original records again.
    console.error(error.message);
    const clean = spawnSync('git', ['status', '--short'], { encoding: 'utf8' });
    console.error(clean.stdout);
    process.exitCode = 1;
  }
}
