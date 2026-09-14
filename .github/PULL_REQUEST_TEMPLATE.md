## Branch

<!-- e.g. feature/core-architecture -->

## Task checklist

<!-- Copy the relevant section's checklist from README.md and check off each item. -->

- [ ]

## Commit summary

<!-- One line per commit, summarizing what changed and why. -->

## Test checklist

- [ ] `ng lint` is clean
- [ ] `ng test` is green
- [ ] Component tests pass (where the branch's checklist calls for them)
- [ ] End-to-end tests pass (where the branch's checklist calls for them)

## Code review checklist

- [ ] No business logic in components; components only read signals from a facade service and call its methods
- [ ] No direct `HttpClient` calls outside `*ApiService` files, no direct SQLite plugin calls outside `*LocalService` files
- [ ] Every `*ApiService` is built on `BaseApiService`, no hand-rolled error mapping or `zod` validation inline
- [ ] Facade services expose state as a Signal holding a discriminated union (`idle`/`loading`/`error`/`success`)
- [ ] Offline-first reads go through `loadOfflineFirst()`; offline writes register a `SyncService` reconciler where a temp id is involved
- [ ] Commits are atomic (one commit per file added or modified), follow Conventional Commits, no em dash, no Claude/Anthropic mention
