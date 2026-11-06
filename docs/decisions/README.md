# Project decision log

[Read accepted decisions](../DECISIONS.md). The central table is generated; never
edit it manually. This is a lightweight, MADR-inspired record of meaningful choices
and their reasons, reviewed alongside the implementation. No model or LLM runs in
publication: agents draft records during development and reviewers accept the words.

## Contribute a decision

A PR can have zero decisions. Typos, routine dependency updates and straightforward
fixes do not need a record unless they introduce a meaningful choice.

For a meaningful choice, add **one** uniquely named JSON file under
`docs/decisions/records/`, using a descriptive lowercase hyphenated filename.
The name does not require a PR number. Use this shape (example only, not history):

```json
{
  "schemaVersion": 1,
  "decisions": [
    {
      "category": "Process",
      "decision": "Keep reviewed decision inputs separate from generated output so parallel PRs do not edit a shared table."
    }
  ]
}
```

Write each decision as one concise sentence stating the choice and its real reason.
Do not invent an approval, rationale or alternative. The ordered array assigns
numbers starting at 1 within the PR. Do not add IDs, PR numbers or dates yourself.
During review, edit this PR's new record as needed. After merging, it is immutable,
even while its publication PR is pending. One new record per PR is the maximum;
an empty decision list is invalid. PRs with no record remain valid.

The single allowed-category list is `CATEGORIES` in `scripts/decisions/model.mjs`:

| Category       | Meaning in Lease Loop                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| UI             | User experience, layout and interaction choices                                                                    |
| Contract       | Leasing business agreements: price locks, lease terms, buyouts and customer/lessor obligations; not API interfaces |
| API            | HTTP boundaries, request/response interfaces and API contracts                                                     |
| Database       | Persistence, schemas and transactional data choices                                                                |
| Auth           | Identity, sessions, authorization and ownership                                                                    |
| Infrastructure | Hosting, build and operational choices                                                                             |
| Testing        | Verification strategy and test tooling                                                                             |
| Process        | Team workflow, review and documentation policy                                                                     |

Use one primary category. To introduce another category, update `CATEGORIES`, its
tests and this guide together in a reviewed PR; do not insert ad hoc categories.

## IDs, dates and historical integrity

An accepted record produces IDs `D-<PR number>-<decision number>`, for example
`D-21-01` and `D-21-100`. The PR number is never padded. Every ID links to the
original PR. Dates are the PR's actual merge date in UTC, not the record date or
publication date. The full UTC timestamp is stored in `index.json` and determines
ordering, followed by PR number and ordered decision number.

`index.json` is generated durable metadata: it contains the source filename,
SHA-256 digest, original PR number/URL, merge timestamp, assigned IDs and reviewed
decision snapshots. Together with the source files it can rebuild the entire table.
Retries must reproduce those original associations rather than assigning decisions
to the later repair or publication PR.

Never rewrite or renumber historical decisions. Supersede a choice with a new PR
and new record whose sentence explicitly references the old ID. Both rows remain.
For a historical wording mistake, use that same reviewed superseding-record process;
there is no silent-edit exception. For damaged generated files, a maintainer can
reconcile and open a repair PR containing only the regenerated outputs. The repair
must reproduce original GitHub metadata, not invent replacement dates or approvals.

## Publication and repository policy

The inspected `Main rules` ruleset requires PRs and permits no bypass. Accordingly,
publication uses one rolling PR from `automation/decision-log`; **the table on main
updates only when that PR is merged**. The workflow never writes directly to main,
merges a PR, enables auto-merge, changes protection or provisions credentials.

A default-branch push adding a record triggers `decision-log.yml`. The trusted
workflow checks out the latest default branch, reconciles **all** merged source
records, updates only `index.json` and `docs/DECISIONS.md` on its bot branch, and
opens or updates the rolling PR. Unmerged PRs and PRs targeting other branches do
not publish. No record means no write. Generated-only commits have no record
changes, so they cannot trigger a publication loop.

Runs are serialized without canceling running jobs. Every run rereads the default
branch and reconciles all records, so delayed/retried jobs preserve decisions from
other merges. Updates retain the prior bot branch as a merge parent and use normal
fast-forward pushes, without force-pushing. A publication failure can be retried or
recovered with manual dispatch; no event-local cache or artifact is authoritative.

The workflow needs `contents: write` and `pull-requests: write` on its built-in
`GITHUB_TOKEN`. The maintainer confirmed **Allow GitHub Actions to create and
approve pull requests** is enabled, so no additional credential is required.
No repository setting was changed. If policy later disables it, keep generation
manual until the owner approves a suitable GitHub App/token or workflow policy.
Never add a token or bypass protections silently.

PRs created by `GITHUB_TOKEN` may not trigger other workflows automatically. If
required checks are introduced for the rolling PR, use an owner-approved way to
trigger them or an approved App credential; never mark them passed or bypass them.
GitHub can require approval before running these workflows; this is separate from
PR-description checkboxes. Newly created publication PRs use the shared summary-first
format with no manual checklist. The publisher preserves existing PR descriptions.

## Local commands and recovery

Use the repository's Node 22 runtime. No new dependencies are introduced.

```bash
npm run decisions:validate
npm run decisions:test
npm run decisions:preview
npm run check:all
```

`preview` prints the table from the durable index without publishing or assigning
new decisions. Unmerged records never appear in it. For PR validation including
immutability and the one-record limit, pass the full base commit SHA:

```bash
npm run decisions:validate -- --base <full-base-commit-sha>
```

The PR workflow takes this SHA from the first parent of GitHub's checked-out test
merge, after confirming that the checkout is a merge. This pins validation to the
base actually represented by the checkout. An older base SHA in an event payload
must not make already-merged source records look like new additions to a rolling PR.

For recovery, use a clean, up-to-date default-branch checkout with full Git history
and a working `origin`. Authenticate `gh` with repository contents and pull-request
read access, then run:

```bash
git fetch origin
npm run decisions:reconcile
npm run decisions:reconcile:check
```

For ordinary records, reconciliation discovers the original addition commit,
queries its associated PRs, verifies the PR merged into the default branch and
originally added the record, and checks the reviewed content at its merge commit.
Explicit historical backfills instead verify the declared original PR and its
hashed evidence files as described below. It rebuilds the index and table from scratch, including entries
missing after a failed publication. Ambiguous origin or altered source is an error,
not permission to guess. Pagination handles large PRs. No historical PRs without
tracked decision records are imported, and no examples are inserted as history.

`GITHUB_REPOSITORY=owner/repo` selects the repository (otherwise origin is used).
`DECISIONS_DEFAULT_BRANCH` selects its default branch (defaults to `main` locally;
the workflow supplies the actual GitHub default branch and verifies it).
Recovery uses the repository, commit-associated-PR, PR details and PR files REST
endpoints. It requires network access; read credentials suffice to reconcile locally.
Open a repair PR for generated changes rather than pushing them directly to main.

To retry publication after approval, an owner can manually run the **Publish
decision log** workflow on the default branch. Existing mappings and merge dates
are reconstructed; the retry does not create additional rows or duplicate commits.

## Explicit historical backfills

Historical backfill requires an explicit maintainer request and a separate review.
The requested backfill of PRs #7, #11 and #16 is recorded under
`docs/decisions/backfills/`, separate from decisions authored in their original PRs.
The wording is a retrospective summary reviewed in the backfill PR; it must not be
represented as wording originally approved in those old PRs.

Each historical file has `schemaVersion`, `originalPrNumber`, `evidenceFiles`
(an array of repository paths and SHA-256 digests) and an ordered `decisions` list.
Evidence must be a file changed in the original PR, read at its actual merge SHA.
Only record choices supported by that implementation/documentation and discussion;
do not invent alternatives, rationales or approvals. Dates and PR URLs are retrieved
from GitHub, not typed into the record. Evidence hashes are checked against the
original merged files on every reconciliation.

A backfill PR may add one historical file per original PR and include regenerated
metadata/table in the same review. This is an explicit exception to the ordinary
one-new-record-per-PR limit; ordinary records under `records/` retain that limit.
Run `npm run decisions:reconcile` with GitHub read access to generate the outputs,
then validate them with `npm run decisions:validate -- --base <full-base-sha>`.
CI verifies original merge metadata and evidence for newly proposed historical
records before accepting generated outputs. Reviewers approve the retrospective
wording and generated rows together. After merge, future recovery uses the same
original PR IDs and merge dates, never the later backfill PR's number or date.

Historical source files and published metadata are immutable like ordinary records.
Never renumber existing decisions to insert older ones; chronological table ordering
places the added older PRs first while preserving all existing IDs. A second source
for an already published original PR is rejected rather than creating collisions.

### Review evidence for this requested backfill

- PR #7: `AUTHENTICATION.md` and `src/server/auth-handler.ts` at original merge
  `dc0efefcafe6d5f43272e65804e5ebce440827d4` support session-derived ownership and
  atomic authentication/audit writes.
- PR #11: `LEASE_DASHBOARD.md` at original merge
  `f37fb543bd3b0a61b3dcd10738dcf5dbc4569b98` documents issued VAT snapshots,
  forecasts, and lease-change requests that require review before fulfilment.
- PR #16: `src/app/api/checkout/route.ts` and `src/domain/forecast-changes.ts` at
  original merge `d28cc1b4baeb21d5d4bff78897932e6c10855fc8` support server-side
  price validation and grouping forecasts into amount-change periods.

Their original descriptions/reviews were inspected; PR #7 has no description or
rationale discussion, so its written implementation guide is the evidence rather
than an invented review conversation. These summaries still require review in the
new backfill PR. Existing `D-26-01` and `D-26-02` remain byte-for-byte unchanged.
