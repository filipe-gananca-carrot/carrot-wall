# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Carrot Wall — a live Q&A/feedback wall for a 5-day Claude Code masterclass. Attendees post
from their phones, the instructor answers/pins from `/admin`, a projector shows `/tv`.
Portuguese UI. **The spec is the source of truth: `spec.md`** (features F1–F8, acceptance
criteria, design tokens). `feature-ideas.md` is the challenge backlog. `setup-docs/` holds the
course guides that drive the build.

**F1–F8 are all built.** Five routes, fifteen Java classes, six Flyway migrations, and a real
test suite (60 JUnit, 94 Angular unit, 7 Playwright). New work means extending this, not
scaffolding it — check `git log` and `docs/specs/` before assuming anything is missing.

## Commands

```bash
cd apps/api && ./mvnw quarkus:dev          # API, port 8080 (first run downloads a lot)
cd apps/web && npm install && npm start    # web, port 4200, proxies /api to 8080
cd apps/api && ./mvnw test                 # 60 JUnit tests
cd apps/api && ./mvnw test -Dtest=ClassName#methodName      # single test
cd apps/web && npm test                    # 94 unit tests (vitest + jsdom)
cd apps/web && npx ng test --include src/app/wall/wall.spec.ts   # single file
cd apps/web && npx ng test --filter '^WallService'               # regex on test names
cd apps/web && npm run e2e                 # 7 Playwright tests (boots both servers itself)
cd apps/web && npx prettier --check .      # no eslint / `npm run lint` in this repo
```

**On this machine the workflow is Docker** — the host has no JDK 21, so `./mvnw` fails there.
Both containers are long-running; these are the in-container equivalents of the above.

```bash
docker compose up --build                  # both apps in dev mode w/ hot reload (8010 / 3010)
docker compose down -v                     # stop AND wipe the H2 db + dependency caches
docker compose exec web npx ng test --watch=false        # 94 unit tests
docker compose exec web npx ng test --watch=false --include src/app/wall/wall.spec.ts
# API tests build in /tmp inside a throwaway container, so they never touch the running
# dev server's bind-mounted target/ — `exec api mvn test` would, and can wedge quarkus:dev.
docker compose run --rm --no-deps -T api sh -c 'cp -r /api /tmp/build && cd /tmp/build && mvn -B test'
```

```bash
docker compose run --rm e2e                              # 7 Playwright tests
docker compose run --rm e2e npx playwright test tv-mode  # single spec file
```

The `e2e` service runs on Microsoft's Playwright image, because the `web` image is Alpine and
Playwright ships no Alpine browser builds. It is profile-gated, so `docker compose up` never
starts it, and it drives the **already-running** `web` service rather than booting its own —
`playwright.config.ts` skips its `webServer` blocks whenever `E2E_BASE_URL` is set, so a plain
host `npm run e2e` still boots both servers itself, unchanged.

**The e2e suite writes to the dev database.** It submits real posts through the real form, so
each run leaves a couple behind on the wall in the `api-data` volume. Hide them from `/admin`,
or `docker compose down -v` to reset.

**Prerequisites that bite:** the API needs **JDK 21** (`maven.compiler.release=21`; anything
older fails with "release version 21 not supported"). Running on the host also needs
`npm install` in `apps/web` first — `node_modules/` exists there as an empty mount point for
the docker-compose volume, so its presence does not mean deps are installed. Docker sidesteps
both. Node 20+; Node 25 works and warns.

Only env var: `ADMIN_PIN` (defaults to `0000` — set it for anything real). The H2 file lives in
`apps/api/data/` (gitignored), created and seeded on first boot; delete it to start clean.

Quarkus dev extras are live and unoverridden — `swagger-ui` and `smallrye-openapi` show up in
the boot banner's installed features: Dev UI at `/q/dev/`, schema at `/q/openapi`, Swagger UI
at `/q/swagger-ui`.

## Shape

- **`apps/web`** — Angular 22 standalone components, TS 6, signals throughout, `OnPush`
  everywhere. Routes: `/` wall, `/post` submit, `/tv` projector, `/admin`, `/materials`.
  Polls every 5s; no websockets. Angular Material is themed in `styles.scss` but **no component
  uses a Material component** — the UI is hand-built from the design tokens.
- **`apps/api`** — Quarkus 3.39 / Java 21, Panache entities with static query methods, no
  service layer. H2 **file** DB in PostgreSQL mode; **Flyway owns the schema**
  (`quarkus.hibernate-orm.schema-management.strategy=none`); `%test` uses in-memory H2 so
  `./mvnw test` never collides with a running dev server. Page size 30 (3 under `%test`, so
  pagination tests need only a handful of rows).
- **Production is one container** (root `Dockerfile`): the Angular build lands in the Quarkus
  jar's `META-INF/resources`, both served on port 8080.
- `apps/api/README.md` is the stock Quarkus scaffold README — generic framework boilerplate,
  not project truth. This file and `spec.md` are.

### The API surface

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /api/wall` | none | **One endpoint, three modes** — see below |
| `POST /api/posts` | none | Manual validation, rate-limited on `X-Client-Token` |
| `POST /api/posts/{id}/upvote` | none | 404s on a hidden post; dedup is client-side only |
| `POST /api/admin/login` | none | PIN → `admin_session` cookie |
| `GET /api/admin/session` | `@AdminOnly` | Also the canary proving the 401 filter works |
| `PUT /api/admin/posts/{id}/answer` | `@AdminOnly` | Blank body clears the answer |
| `POST /api/admin/posts/{id}/{pin,unpin,hide,unhide}` | `@AdminOnly` | |
| `GET /api/admin/prompts/presets` | `@AdminOnly` | |
| `POST /api/admin/prompt` | `@AdminOnly` | `presetId` or free `text` |

## The five things that carry the design

Understand these before changing anything; most bugs come from breaking one of them.

1. **`GET /api/wall` is one endpoint with three modes**, all returning the same `WallResponse`:
   no params → first page (all visible pinned, then newest page of unpinned); `?before&beforeId`
   → older page; `?since` → poll delta plus `removedIds`. Separate endpoints per mode would be
   three places to forget the hidden-post filter. **Do not split it.**
2. **`updated_at` + `serverTime` are the whole real-time story.** The server returns its own
   clock; the client hands it back as `?since`. `Post`'s `@PreUpdate touch()` is what makes any
   mutation visible to pollers — hence the bulk-update ban below.
3. **`includeHidden` is ANDed with a real session check** (`WallResource.java:50`), not trusted
   from the query param. Simplifying that away leaks every hidden post to anyone who appends
   `?includeHidden=true`.
4. **`WallService` holds posts as an id-keyed `Map`, never an ordered array.** `posts` is a
   `computed` that sorts fresh (pinned first, then newest). A delta upserts or deletes by id and
   ordering takes care of itself. Its `pollInFlight` chain serializes overlapping polls so a
   stale response can't overwrite a fresh one — it is subtler than it looks; leave it alone.
5. **`WALL_INCLUDE_HIDDEN` is an injection token.** `AdminComponent` re-provides it (plus its
   own `WallService` instance) so `<app-wall>` is reused verbatim on `/admin` without touching
   the app-wide singleton `/` uses. Reuse this pattern rather than forking the component.

## Conventions

- **Never edit an existing Flyway migration** — add a new versioned file. They live in
  `apps/api/src/main/resources/db/migration/` and deliberately tell a story (V1 posts →
  V2 answers/moderation → V3 prompts + seed → V4/V5 `updated_at` → V6 prompt presets), because
  Day 1's exercise is "explain the migrations"; a hook in `.claude/settings.json` blocks edits
  to existing ones. Keep the SQL portable across H2-PG mode and real Postgres: no `JSONB`,
  no arrays.
- **Never mutate a `Post` via a bulk `update(...)` string** (e.g.
  `Post.update("upvotes = upvotes + 1 where id = ?1")`). Bulk updates bypass `@PreUpdate`,
  leaving `updated_at` stale and the change invisible to every polling client. Load the row and
  call the entity's own method (`pin()`, `hide()`, `upvote()`, `answer(text)`).
- **Validation in resources is manual, not Bean Validation.** `hibernate-validator` is on the
  classpath but unused on purpose: the message must be *trimmed before* its length is checked
  (a whitespace-only message is empty), which `@NotBlank`/`@Size` can't do in one pass. Follow
  `PostsResource.create` — check by hand, return `ApiError` with a warm Portuguese message.
- **Every user-facing error string is Portuguese**, warm, never a raw validation message.
- **Post messages render as text, never HTML.** Angular interpolation only, no `[innerHTML]`
  anywhere — acceptance criterion 12 is an XSS check, and `tv/qr.ts` builds SVG as data rather
  than markup specifically to keep that true.
- Hidden posts are a soft delete: excluded from every public response, never deleted from the DB.
- Admin routes and admin API endpoints return 401 without the PIN session cookie. New admin
  endpoints opt in by annotating `@AdminOnly` — never re-implement the check.
- **Adding a frontend route means editing `SpaRoutes.java` too.** `SPA_PATHS` is an explicit
  list (not a catch-all, so `/api` and static assets are untouched); miss it and a refresh on
  the new route 404s in production only.
- `docs/intents/` holds `spec.md` cut into eight buildable slices in dependency order — start
  there, not at the spec, when picking up work. Feature specs go in `docs/specs/`, named
  `<NN>-<feature-name>.md` matching the intent's number and slug; a plan is the same name with
  `-plan` appended. Both READMEs spell this out.
- Tests: JUnit beside the resource (`apps/api/src/test/java/pt/ecrop/wall/`), Angular unit tests
  beside the component, Playwright e2e in `apps/web/e2e/`. A change is not done until
  `./mvnw test` and `npm test` both pass.
- Design tokens are CSS custom properties on `:root` in `apps/web/src/styles.scss`
  (`--wall-bg` ivory `#FAF9F5`, `--wall-ink` `#141413`, `--wall-accent` coral `#D97757`,
  hairline borders, no drop shadows, serif headings + Inter). `DESIGN.md` at the root is the
  full system and wins on any conflict with spec §4.

## Known limitations (deliberate — don't "fix" them unprompted)

These are conscious tradeoffs for a ~15-client classroom, documented so nobody re-litigates
them by accident. They are also exactly what breaks first if this ever needs to scale.

- **Polling, not websockets** (spec §3). 5s is the contract.
- **Server state is in process memory.** `AdminSessionStore` (no expiry, no logout) and
  `RateLimiter` are plain maps — correct only because production is a single container.
  Anything that adds a second replica has to move both out first.
- **`RateLimiter` is not a security control.** It keys on a client-supplied `X-Client-Token`
  (IP-keying would lock out the whole room behind one classroom NAT) and a request with no
  token is deliberately never limited.
- **Upvote dedup is `localStorage`** (spec F5: "good enough for a friendly room"). The endpoint
  itself is open, and `Post.upvote()` is a read-modify-write with no optimistic locking.
- **H2 file DB.** The Postgres config sits commented out at the bottom of
  `application.properties` and has never been exercised.
- There is no CI — nothing runs the suites on push.
