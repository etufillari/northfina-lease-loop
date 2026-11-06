# TODO

## Before the pitch (16:30)

- [ ] **Catalogue status filter label.** Sold items are now hidden unless "Sold" is picked
      (`src/domain/catalogue.ts`, `HIDDEN_BY_DEFAULT`), but the default option still says
      "Any status" (`filters.anyStatus` in `src/i18n/messages/{en,fi,sv,et}.json`). Decide
      whether to keep it or rename it (e.g. "All except sold"), in all four languages.
