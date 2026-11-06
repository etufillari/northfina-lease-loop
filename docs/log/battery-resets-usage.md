# Time log: a battery replacement resets the usage the value counts (D83)

Real clock, Helsinki. Coordinator: Fable; coding agent: Opus. Branch `fix/battery-resets-usage` from `origin/main` 75069eb.

| When             | What                                                                                                                                                                                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-06 10:42 | `npm run setup` (1 min 34 s); branch renamed; read `AGENTS.md`, `RULES.md`, `data/DATA.md`, the assessment, market value, refurbishment plan, exit, the second-life service and the card 9 tests; D68 and D79.                                                                |
| 10:50            | Storage choice: no new column. The assessment rows already record each battery replacement (its step and the usage it was done at), as they do for the farm machine's service, so `usageAtLastReset` reads the newest; a pack item has none and its usage since is the total. |
| 10:52            | Tests first: the organisers' three numbers (92 781, 115 976, 151 661), the next battery at 15 000 km / 500 cycles since the last one, a replaced meter, card 9's new numbers. 20 failing. Commit `test(second-life)`.                                                         |
| 10:55            | `refurbishmentPlan` gets `usageAtLastReset` and returns the total (`usageAfter`) and `usageSinceResetAfter`; `assessReturn` values on the latter. A `−0 %` showed up (0 steps × −200 bp): fixed in `usageAdjustment`, with a test.                                            |
| 10:58            | New match numbers worked out on the pack: `wait-02` still wins (8 710 ≤ 9 000), `wait-13` second (7 219), `wait-03` drops out (6 317 over 6 000), `wait-04` third. The exit takes the same counter.                                                                           |
| 11:02            | Server: the relist keeps the total (18 400 km, was 0); the history read feeds the assessment and the exit. Three server tests moved: an exit after the relist must now report at least 18 400 km. 1 453 tests green, typecheck green. Three `fix` commits.                    |
| 11:06            | D83 row, D79 replaced; second-life, exits and demo-cards feature pages, README Status card 9, `docs/demo.md`, mentor questions, this log.                                                                                                                                     |

## Left undone

- The second-life page shows the usage-reset note but not the two counters side by side (total and since the battery); the passport shows the total only.
- D61 still decides refurbishing beyond the mandatory steps by the waiting list, not by the organisers' gain-against-cost comparison (58 880 of value for 51 500 of work to good); the feature page shows the comparison.
- D68's status still reads "replaced by D79" (left as history; D83 gives the same value as D68 did, with the total kept).
