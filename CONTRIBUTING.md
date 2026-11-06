# Contributing to Lease Loop

Use this workflow for team changes. [RULES.md](RULES.md) defines the judged
engineering requirements; [AGENTS.md](AGENTS.md) also applies to coding agents.
The final hackathon submission has its own format, described below.

## Make focused, conventional commits

Work on a feature branch and review `git status`, `git diff` and the staged diff
before committing. Stage only the files intended for the change. Keep each commit
focused on one understandable change.

Use `type(scope): subject` for every new commit, for example:

```text
feat(pricing): explain monthly rent and VAT
fix(invoices): clamp February due dates
docs(contributing): explain the PR summary
```

Allowed types are `feat`, `fix`, `test`, `refactor`, `docs`, `style`, `chore`, `ci`
and `perf`. Use a short scope that names the affected area and a subject that says
what changed. Add a body when a decision or trade-off needs explanation. Reference
real issues or tickets when relevant; never invent an identifier.

Keep Git hooks enabled. Fix hook failures before retrying; never use `--no-verify`
or otherwise disable the hooks. Before pushing, run `npm run check:all` (or
`make check`) and record its actual outcome. CI also checks commit messages.

## Open or update a team PR

Target the team fork's `main` branch. Use a short conventional title such as
`docs(contributing): explain the PR summary`. Add the related issue/ticket ID when
one exists. The final title must describe the final diff.

Read [.github/pull_request_template.md](.github/pull_request_template.md) before
creating or updating the PR. Complete its first four sections in this order:

1. **Summary:** 1–2 short sentences, at most 50 words. Say what changed and why it
   matters to the person using or maintaining it. Use plain language; put file
   lists, implementation details and test results in the later sections.
2. **Context:** Explain the need or bug and link the related issue/ticket. Write
   `No linked issue` when there is none.
3. **Description:** Explain the resulting behavior, important implementation
   details, trade-offs and any migrations or configuration changes.
4. **Testing Instructions:** Give useful setup, actions, expected outcomes and
   relevant edge cases, or explain why manual steps are N/A. Include material local
   failures or validation gaps; CI already reports the automated results.

**Screenshots / Recordings** is optional. Add available visual evidence when it helps,
labelled with viewport and state; omit the section otherwise. No manual checklist,
checkbox ticks, self-review attestation or visual-review signoff is required.

For example, a summary for setup improvements could read:

> Teammates can now set up and run Lease Loop with short Make commands. The README
> explains configuration and everyday workflows.

Replace the template's prompts with concrete information. Retain the four required
headings and use `N/A — <reason>` for an inapplicable section. If reporting local
checks, give their actual outcome, including environmental limitations; an alternative
build does not make a failed `npm run check:all` pass. Never invent evidence or issue links.

For meaningful project choices, include one new reviewed decision
record following [the decision guide](docs/decisions/README.md). Routine changes do
not need a record. Never edit the generated decision log or merged records.

## Automated checks

GitHub Actions supplies objective results instead of asking authors to tick boxes:

- **PR description:** checks the conventional title, required section order, nonempty
  sections and the 50-word summary limit whenever a PR is opened or edited, receives
  commits, is reopened or becomes ready for review. The one- or two-sentence plain-language
  style remains writing guidance, not an automated claim about quality.
- **CI:** checks commit messages, formatting, lint, types, file size, no-AI rules,
  tracked-file secret scanning, tests/coverage and the build. Tests already check
  en/fi/sv/et translation keys.
- **Validate decision records:** verifies decision records and historical integrity.
- **Publish decision log:** regenerates accepted history after records merge and opens
  the rolling documentation PR. Its generated description also has no manual checklist.

Use the PR's Checks tab for these results; copying them into a PR table is optional.
For a local metadata check, save a GitHub pull-request event as JSON and run
`npm run check:pr -- path/to/event.json`. `npm run check:secrets` scans tracked files
locally and is also part of `make check` / `npm run check:all`.

These checks validate structure and code, not whether prose is understandable or
whether a design meets the customer's needs. Supply useful reviewer information
directly rather than certifying it with checkboxes. GitHub may separately require
approval before workflows run on an automation-created PR; Markdown checkboxes do
not control that platform permission.

## Keep the PR accurate through review

Review the final diff yourself before requesting review. As scope changes, update
the title, summary, description and validation results together. Explain the final
behavior; omit abandoned approaches unless they explain a relevant trade-off.

When merging has been authorized, check the resulting commit message as well. For
a squash merge, use `type(scope): subject` for the squash title; GitHub uses it as
the commit subject. A descriptive but nonconventional title can make later CI fail
even when the feature branch's commits passed.

## Final judging PR

Use [.github/hackathon_submission.md](.github/hackathon_submission.md), the title
`Team <name>: <your product name>` and the upstream destination/deadline in
[README.md](README.md#submitting). Keep the submission template's sections and
report only completed Spine steps, Smart Problems, scenario cards and checks.
The team PR title and section order above do not replace this judging format.
