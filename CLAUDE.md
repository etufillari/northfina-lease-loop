@AGENTS.md

## Team conventions

- Log every product, domain or engineering decision in [docs/decisions.md](docs/decisions.md) in the same PR as the change. Never rewrite an entry; supersede it.
- `main` is protected. Work on short-lived branches, open a PR against **our fork's** `main` (`gh pr create --repo slowTake/northfina-lease-loop --base main`), squash-merge once CI is green. The upstream submission PR is opened separately.
- Write domain tests first (red, green, refactor). Expected values come from the data pack's worked example or a hand calculation, noted next to the assertion, never from running the code.
- Round money only with `roundHalfUp` from `src/domain/money.ts`, once per amount.
- `.local/` is git-ignored scratch space for plans and notes that don't belong in the submission.
