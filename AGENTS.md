# Instructions for AI coding agents

You are helping a hackathon team build **Lease Loop**. The challenge is in `CHALLENGE.md`; the engineering rules in `RULES.md` are judged and must be followed. The short version:

- **No AI inside the product.** Never add an AI, ML or LLM SDK, model or API call to the app. All product logic is rules, data and algorithms. `npm run check:no-ai` enforces this.
- **Business logic goes in `src/domain/`** as pure functions: no I/O, no database, no `fetch`, no `Date.now()` / `new Date()` / `Math.random()`. Pass dates (ISO `YYYY-MM-DD`) and data in as arguments. Every function gets Vitest tests next to it, including edge cases.
- **Money is integer euro cents.** Never use floating-point euros for amounts. Round once, deliberately, and document the rule.
- **API routes** use `ok()` / `fail()` / `handleRoute()` from `src/server/api-response.ts`. Never return raw error messages or stack traces.
- **Every data change** goes through `withAudit()` in `src/server/audit.ts`. Use the `tx` it gives you for every write in that change.
- **Database changes:** edit `prisma/schema.prisma`, then run `npm run db:migrate`. Never hand-write migration SQL.
- **UI strings** go in `src/i18n/messages/{en,fi,sv,et}.json`, with the same keys in all four.
- **UI and UX:** read `UI_UX.md` for information hierarchy, readability and layout. It takes precedence over `DESIGN.md` on those decisions.
- **Files stay under 600 lines.** Split by responsibility.
- **Commits** use conventional messages: `type(scope): subject`. Never use `git commit --no-verify` or `git push --no-verify`. If a hook fails, fix the cause.
- Before saying a change is done, run `npm run check:all`; it's what CI runs.
- Read `data/DATA.md` before using the data pack. Schemas for every data file are in `src/data/schemas.ts`.

## Commits and pull requests

- Read `CONTRIBUTING.md` for the shared commit and PR workflow. Before creating or
  updating a team PR, read `.github/pull_request_template.md` and use its sections
  in order. This applies to every coding agent working in this repo.
- Start the PR body with `## Summary`: 1–2 plain-language sentences, at most 50 words,
  stating what changed and why it matters to the person using or maintaining it.
  Keep implementation details and test results in the later sections. Rewrite the
  summary and title when the scope changes so they describe the final diff.
- Use a short conventional title, `type(scope): summary`, with an issue/ticket ID
  when one exists. Describe the final diff, the customer impact and relevant trade-offs.
- Keep commits focused and conventional. Stage only intended files and leave hooks
  enabled. When a squash merge is authorized, use a conventional squash commit title
  too; CI validates the resulting commit as well as the PR's individual commits.
- Complete Summary, Context, Description and Testing Instructions; use `N/A` with
  a reason where appropriate. Screenshots / Recordings is optional. Do not add a
  manual attestation checklist or require checkbox ticks for review.
- CI is the source for automated check status: title/description structure, formatting,
  lint, types, coverage, file size, no-AI rules, secret scanning, translation keys and
  decision-record validation. Do not replace those results with self-reported ticks.
- Report only local checks actually run and include relevant failures or validation
  gaps. Do not invent issue links, screenshots or test results. Include visual evidence
  when useful; no separate visual-review checkbox or N/A signoff is required.
- Use `.github/hackathon_submission.md` for the final judging PR and follow the
  submission title and deadline in `README.md`; the judging format is separate from
  the team PR template.

## Decision records

- Consider whether the PR makes a meaningful project choice; routine changes need no record.
- If yes, include one uniquely named JSON record in `docs/decisions/records/` with
  its ordered decisions. Follow `docs/decisions/README.md` and use only categories
  from `scripts/decisions/model.mjs`. State the actual choice and reason concisely.
- Review the wording with the implementation and run `npm run decisions:validate`
  before requesting review. Do not invent decisions to satisfy a checklist.
- Backfill history only on explicit maintainer request, in a separate reviewed PR.
  Use `docs/decisions/backfills/` with verified original-merge evidence; follow the
  historical backfill procedure in the decision-log guide. Do not rewrite existing IDs.
- Never edit the generated `docs/DECISIONS.md` or assign PR numbers, IDs or merge dates.
- Merged records are immutable. Supersede a decision in a new PR with a new record
  referencing its old ID; never rewrite historical wording or renumber it.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
