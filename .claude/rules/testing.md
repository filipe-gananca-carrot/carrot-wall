---
paths:
  - "apps/web/**/*.spec.ts"
  - "apps/api/src/test/**/*.java"
---

# Testing conventions

Written against NASA/JPL's _Power of Ten_ (Holzmann, 2006), translated from safety-critical
C to this suite. Rules 3, 8 and 9 (heap, preprocessor, pointers) have no analogue in TS or
Java tests and are dropped. The rest hold, and the suite already obeys them — keep it that way.

## Running them

On this machine the workflow is Docker (no JDK 21 on the host).

- Web unit tests: `docker compose exec web npx ng test --watch=false` (94 tests)
- API tests: `docker compose run --rm --no-deps -T api sh -c 'cp -r /api /tmp/build && cd /tmp/build && mvn -B test'`
  (60 tests) — **not** `docker compose exec api mvn test`, which writes to the bind-mounted
  `target/` and can wedge the running `quarkus:dev` server.
- E2E: `docker compose run --rm e2e` (7 tests). It drives the already-running `web` service and
  **writes to the dev database** — every run leaves real posts on the wall. Hide them from
  `/admin`, or `docker compose down -v` to reset.

See CLAUDE.md for the plain `npm test` / `./mvnw test` equivalents off Docker.

## The rules

1. **No complex flow in a test** (P10 §1). No recursion, no conditional assertions. A test that
   needs an `if` to know what to assert is two tests. Branching hides the case that never ran.
2. **Every loop and every wait has a fixed bound** (P10 §2). Table-driven loops iterate a literal
   list; `vi.advanceTimersByTime(6000)` beats sleeping; every Playwright `expect` that can race
   carries an explicit `{ timeout: N }`. Never `while (!condition)`, never a bare `waitForTimeout`
   as a synchronisation device.
3. **One screenful per test** (P10 §4). If the arrange block outgrows the assertions, extract a
   builder or fixture. A test you must scroll is a test nobody re-reads when it fails.
4. **At least two assertions per test** (P10 §5) — the outcome _and_ the side effect. Asserting a
   201 without asserting what landed in the DB is half a test. This is the rule that catches the
   most real bugs; it is also the one most often skipped.
5. **Smallest possible scope for test data** (P10 §6). Build state inside the test that needs it.
   Shared mutable fixtures across tests make failures order-dependent, and order-dependent
   failures get re-run until green instead of fixed.
6. **Check every return value, and the parameters you pass** (P10 §7). No fire-and-forget calls
   whose result is dropped. An HTTP mock that is set up must be asserted as consumed
   (`httpMock.verify()`); an unconsumed expectation is a test that silently proved nothing.
7. **Zero warnings** (P10 §10). Spec files stay clean under `npx prettier --check .`, and a test
   that logs a Zone or change-detection warning is broken even when green. Note the baseline is
   not clean repo-wide: `angular.json`, `src/main.ts`, `tsconfig.app.json` and `tsconfig.spec.json`
   have failed the check since before this rule existed. Don't let a spec join them; don't
   reformat those four as a drive-by either.

## Two more, not from NASA

- A bug fix is not done until a test reproduces the bug **first**. Watch it fail for the right
  reason, then fix it.
- **Never weaken or delete an existing assertion to make a suite pass.** Say what you found
  instead. This is the one rule here with no exceptions — a loosened assertion is a defect
  shipped with its own alibi.
