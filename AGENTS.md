# Instructions for AI coding agents

You are helping a hackathon team build **Lease Loop**. The challenge is in `CHALLENGE.md`; the engineering rules in `RULES.md` are judged and must be followed. The short version:

- **No AI inside the product.** Never add an AI, ML or LLM SDK, model or API call to the app. All product logic is rules, data and algorithms. `npm run check:no-ai` enforces this.
- **Business logic goes in `src/domain/`** as pure functions: no I/O, no database, no `fetch`, no `Date.now()` / `new Date()` / `Math.random()`. Pass dates (ISO `YYYY-MM-DD`) and data in as arguments. Every function gets Vitest tests next to it, including edge cases.
- **Money is integer euro cents.** Never use floating-point euros for amounts. Round once, deliberately, and document the rule.
- **API routes** use `ok()` / `fail()` / `handleRoute()` from `src/server/api-response.ts`. Never return raw error messages or stack traces.
- **Every data change** goes through `withAudit()` in `src/server/audit.ts`. Use the `tx` it gives you for every write in that change.
- **Database changes:** edit `prisma/schema.prisma`, then run `npm run db:migrate`. Never hand-write migration SQL.
- **UI strings** go in `src/i18n/messages/{en,fi,sv,et}.json`, with the same keys in all four.
- **Files stay under 600 lines.** Split by responsibility.
- **Commits** use conventional messages: `type(scope): subject`. Never use `git commit --no-verify` or `git push --no-verify`. If a hook fails, fix the cause.
- Before saying a change is done, run `npm run check:all`; it's what CI runs.
- Read `data/DATA.md` before using the data pack. Schemas for every data file are in `src/data/schemas.ts`.

## Team working rules (on top of the organiser's)

The full kick-off brief is `docs/kickoff-brief.md`; the hour-one decisions are `docs/decisions.md`; the stack traps are `docs/stack-notes.md`. The meta rules above are tested: `tests/meta-rules.test.ts` runs in `npm test` and fails on a file over 600 lines, AI in the app, a domain module without a test, an impure domain file, a route without `handleRoute` or a write outside `withAudit`.

**Priority of sources.** `CHALLENGE.md`, `RULES.md`, `data/DATA.md` and the data pack win. The brief and the decisions file are second. The practice repo (`C:/Git/leasing-platform`, a read-only clone of `ThomasParratt/leasing-platform`) is a parts bin: port functions with their tests, rewrite them under this repo's domain lint, never port its structure or let its design override a rule here.

1. **Test first.** The domain function's test file exists before the function; the test names the card or the trap it proves. A handler test mocks nothing it does not own.
2. **Contract first.** A slice's first commit is its Zod schemas (params, body, response) and its row in the route table; the others build against them before the handler exists.
3. **One owner per table and per shared shape** (`docs/kickoff-brief.md` section 6). Another slice's rows are read through the owner's read function, never with a query on its table. A change two slices must make at one instant is an event inside the transaction (section 7), not a call.
4. **Dates are ISO day strings passed in.** `todayIso()` is called once per request in the page or the route and passed down; the demo clock override lives there and nowhere else. No endpoint trusts a date from the browser except the demo override.
5. **Money is integer cents and the factor is integer millionths.** Multiply cents by the factor in millionths and divide once, rounding half up to the cent, in one function with the rule in its comment.
6. **Outcomes are codes with params, never sentences.** The domain returns `{ code, params }`; the page writes it from the message files in the visitor's language.
7. **Nothing is hard-coded to a scenario card.** A test may pin a card's numbers; the code never knows the card exists.
8. **Write it down.** A decision goes into `docs/decisions.md` with its reason and what was chosen against; every agent task keeps a time log in `docs/log/<task>.md` (real clock: steps, commits, what blocked it, what it left undone); the README stays current in the same commit as the change. Every feature slice ships `docs/features/<slice>.md` in the same PR as its code, in the shape of `docs/features/README.md`: what it does (two sentences); the rule or formula with a worked example on the scenario-card numbers; the decisions it implements (D numbers); the inputs and outputs of its pure functions; the files; the tests that pin the numbers; open questions. The README holds only a "Features" list linking those pages, beside the "Status" table; a stale feature page is a review finding.
9. **Waves.** Features are built in parallel waves, each agent in its own slot (worktree) on its own slice, from a brief (template: `docs/kickoff-brief.md` section 11) that names the base commit, the slot, the files it owns and does not own, the tests to write first, the time limit and the README sections to update. After every wave: one hardening agent and one review-and-upkeep agent (the review in `docs/reviews/`). The hardening agent keeps the README's "Status" section current: a table of the ten scenario cards (card, what the judges compare, works yes/no, the test file that proves it) and the smart problems with what is done, the draft of the submission PR's "Scenario cards that work" and "Smart Problems" sections. The review-and-upkeep agent keeps the README's structure: section order, duplicates after merges, links, the demo steps. A slot's first command after the base-commit check is `npm run setup`: it copies `node_modules` from the main checkout instead of a fresh `npm ci`.
10. **Branches and merges.** Each task works on its own branch with many small conventional commits. Its pull request into `main` is **squash-merged** as one `type(scope): subject` commit whose body lists the pieces, so `main` carries one commit per feature and never the in-between ones. A branch is named after the feature it builds, `<type>/<slice>` with the conventional-commit type as prefix: `feat/pricing`, `feat/invoices`, `chore/wave0-upkeep`, `test/wave1-hardening`; a session that starts on a generated name renames it with `git branch -m` before its first push. Nobody pushes to `main` directly, not even docs or tooling: every change is a branch and a pull request on the fork, CI runs on the PR, and it is squash-merged with a conventional subject. Every PR body has a "Docs" line linking the feature page(s) it ships or changes as files on the branch (e.g. `[docs/features/circular-impact.md](docs/features/circular-impact.md)`); the final submission PR to the organiser lists every page under `docs/features/`, so the judges reach the explanations in one click. Never rebase a shared branch, never `--no-verify`.
11. **Every loop ends.** A command, script or test that waits, polls or retries has a hard deadline or an iteration cap and then fails with a message (`timeout 120 …`, or a counted loop). No bare `while true`; a bug in the command it wraps must never hang a person or an agent.
12. **Done means** `npm run check:all` green, the tests of the change in the same commit, the route in the route table and the OpenAPI file regenerated, the message keys in all four files, the README section current, the time log closed.

**Which model does what.** The coordinating session runs on Claude Fable; every agent or session that writes code or tests runs on Claude Opus (`docs/decisions.md` D18). This is about the tools that write the code; the product itself has no AI in it.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
