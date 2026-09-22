# Newest/oldest sort toggle on the wall

## Problem

`/` always shows unpinned posts newest-first (`WallService`'s `posts` computed: pinned first,
then newest). There's no way to read the wall chronologically from the start — useful for
someone catching up mid-session or reviewing a session afterward.

## In scope

- A toggle control on `/` (public wall) that switches the unpinned feed between newest-first
  (current default) and oldest-first.
- Pinned posts are unaffected: always shown first, always newest-first among themselves,
  regardless of toggle state.
- Purely a client-side re-sort of posts already held in `WallService`'s id-keyed map — no
  change to `GET /api/wall` query semantics. "Load more" keeps fetching older pages via the
  existing `?before&beforeId` regardless of toggle state.
- Preference persists per-browser via `localStorage`, read on load, so a reload/revisit keeps
  the last choice.

## Out of scope

- `/tv` (projector) and `/admin` — unaffected, no toggle added there.
- Changing pagination/fetch direction based on sort order (e.g. fetching newer posts first in
  oldest-first mode).
- Any change to `GET /api/wall`, polling delta semantics, or the API layer at all.
- Server-side sort or a `sort` query param.

## Acceptance criteria

1. `/` shows a visible toggle control distinguishing "newest first" / "oldest first"; default
   state (no stored preference) is newest-first, matching current behavior.
2. Switching to oldest-first re-orders the unpinned posts currently on screen oldest → newest,
   without an API call or page reload.
3. Pinned posts stay at the top, newest-first among themselves, in both toggle states.
4. Loading more posts (scroll/"load more") appends older unpinned posts via the existing
   `?before&beforeId` call in both toggle states, and the appended posts land in the correct
   position for the active sort order.
5. A poll delta (new/updated/removed posts via `?since`) merges into the map and the visible
   order still respects the active toggle state without requiring the user to re-toggle.
6. Reloading `/` after choosing oldest-first restores oldest-first on next load (localStorage);
   reloading with no prior choice defaults to newest-first.
7. Toggle state is scoped to `/` only — `/tv` and `/admin` render unaffected by whatever was
   last chosen on `/`.

## Constraints

- Re-sort happens on the existing `posts` computed signal in `WallService`, or an equivalent
  derived signal — do not fork `WallService` or duplicate its polling/pagination logic (see
  CLAUDE.md point 4: it's an id-keyed map with pinned-first ordering, and the `pollInFlight`
  chain must stay untouched).
- No `[innerHTML]`, no new dependencies, matches existing design tokens (`styles.scss`) and the
  hand-built (non-Material) component style.
- Portuguese UI copy for the toggle labels, consistent with the rest of the app.
