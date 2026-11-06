# Time log: pep-only-when-asked

Branch `fix/pep-only-when-asked` from `main` at `75069eb`, 2026-11-06.

| Time  | Step                                                                                                                                                                                                                                            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11:40 | The organisers' answer on hidden questions; checked the flow: prefill fills visible questions only, D38 compares answered ones, the company country is the registered one (allowed), but `isPep` also took the record's `is_pep` below 10 000 € |
| 11:45 | Removed `knownPep`; tests pinned to the new outcomes (Haapala's e-bike and laptop approved, the farm machine to review; PEP answering "no" goes to review without `pep`)                                                                        |
| 11:55 | D82, question-flow page, README drill line                                                                                                                                                                                                      |

Left undone: none in scope.
