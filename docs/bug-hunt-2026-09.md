# Bug Hunt — September 2026

Scope: Convex backend, Discogs API usage, and non-visual client logic
(`app-context.tsx`, utils, lib). UI and design were out of scope.

Method: static analysis across five parallel research passes (sync pipeline,
proxy actions + OAuth, Convex auth/data functions, `app-context.tsx`, pure
logic/rules engine), with every Critical/High finding re-verified by reading the
code path end to end. No live calls to Discogs or Convex were made. Baseline at
the time of the hunt: `npm test` 317/317 passing, `npm run typecheck` clean.

Confidence key: **Confirmed**: traced in code (or reproduced by running the
pure module). **Plausible**: the mechanism is in the code, but triggering it
depends on external behavior or a race we couldn't reproduce statically.

"Deploy" marks a fix that touches `convex/` and needs `npx convex deploy`
to both deployments before the Vercel push.

---

## Critical

### C1. Collection free-data fields are never written by sync
**Confirmed.** `convex/discogs.ts:999-1021`. Deploy.

`mapRelease` computes `genres`, `styles`, `rating`, `discCount` and
`artistIds` for every release. The projection `syncSelf` sends to
`collection.applyDiff` drops all five. It is the only `applyDiff` call site, and
`git log -S` shows the fields were never in it. The wantlist half of the same
pass was fixed (lines 1063-1073), but the collection half never was.

Because the incoming object lacks the fields, `albumSignature` sees `null`
on both sides and never patches existing rows. So this doesn't backfill on the
next sync; it never backfills at all.

**Effect:** For every user, the cached collection has no genres, styles, or
Discogs ratings. Several things behave as if the collection has none:
- Genre and rating presets
- The genre and rating builder fields (hidden by `availableFields`)
- The `rating-high` sort and the Unrated chip
- Stars in the purge evaluator and album detail
- The Insights "rated two stars or lower" callout
- Share-link evaluation of genre and rating rules

The only ratings that exist are ones set in-app since the last sync, through
`rateAlbum` → `updateInstance`.

**Fix:** Add the five fields to the projection. Add a regression test that
`syncSelf`'s projection forwards every optional field `applyDiff` accepts. The
simplest version exercises a shared projection helper.

---

## High

### H1. `oauth.requestToken` accepts any `callback_url`
**Confirmed (code). Exploitability plausible.** `convex/oauth.ts:50-67`. Deploy.

`requestToken` is public and unauthenticated, as it has to be, and it passes
`args.callback_url` straight into `oauth_callback`. The app already relies on
Discogs honoring a per-request callback, since dev and prod use different
origins. So an attacker can take over an account this way:

1. Call `requestToken` with `callback_url: "https://attacker.example/cb"`. Keep
   `oauth_token_secret`.
2. Send the victim the Discogs authorize link. The consent screen is the real
   Holy Grails app.
3. Discogs redirects the victim to the attacker's URL with `oauth_verifier`.
4. Call `completeLogin` with the victim's token, the attacker-held secret, and
   the verifier. The server derives the victim's username from
   `/oauth/identity` and mints a **90-day Holy Grails session for the
   victim's account**, which also drives every Discogs write proxy.

With the callback pinned to the app's own origin, the verifier only ever lands
in the victim's browser. That browser doesn't hold the attacker's token secret,
so the attack dies.

**Fix:** Validate `callback_url` against an allowlist of origins (prod, the
Vercel domain, localhost:1234), ideally through a Convex env var like
`HG_ALLOWED_ORIGINS` so it fails closed. It must be an exact origin match plus
the `/auth/callback` path, not a prefix match. Add a test.

### H2. `proxyFetchUserProfile` turns real Discogs errors into fake success
**Confirmed.** `convex/discogs.ts:784-830`, caller
`src/app/components/following-screen.tsx:~249`. Deploy.

Non-2xx responses throw `"Failed to fetch user profile (500)"`. The catch then
treats any message that includes `"Failed to fetch"` as a network blip and
returns `{ username: args.username, avatar: "", … }` as success. So the
function's own errors, including 500, 503, 403, and an exhausted 429, are
swallowed. A real Node network error reads `"fetch failed"`, which doesn't
match and does throw, the opposite of what the comment intends.

**Effect:** Follow → "Connected with @typo." with a blank avatar during any
Discogs hiccup. That was the flow's one existence check. `syncFollowedUser`
then fails or caches an empty profile for a user that may not exist.

**Fix:** Drop the string match. Map 404 to "not found", other HTTP errors to a
thrown error, and only `TypeError` or fetch-layer failures to the degraded
return. Callers that follow a user should treat the degraded return as a
failure.

### H3. `format_scope: "vinyl"` changes which releases a session contains
**Confirmed.** `src/app/components/app-context.tsx:725` feeds `albums`, which
feeds `ruleAlbums` (`:2392`), which feeds `stackMembership` (`:2422`).

`ruleAlbums` is built from the scoped `albums`, so for a vinyl-scoped user
every auto session is evaluated over vinyl only. `stacks.getShared` evaluates
over the full `collection` table. So:
- The owner and a share-link viewer see different pools, different
  "25 of 148" counts, and, with rotation, different picks. That breaks the
  Session Builder's "same set" invariant.
- `availableFields` and `buildStackPresets` also read the scoped array, so the
  Format field vanishes from the builder, and genre and label options and
  preset counts omit anything that only exists on non-vinyl copies.

CLAUDE.md says scope is display-only. Rule evaluation isn't display, so this
is a data-layer filter in practice.

**Fix:** Build `ruleAlbums` from the unscoped cache, then apply scope only when
rendering a session's contents. Open product question: should a vinyl-scoped
owner *see* non-vinyl members of their own session? Either answer is fine,
but pool counts and rotation must match the share link.

### H4. The empty-cache guard blocks legitimate transitions to zero
**Confirmed.** `app-context.tsx:759-765` (albums) and `:799-803` (wants).

`if (derived.length === 0 && prev.length > 0) return prev;` tests the
*filtered* result, not the raw cache. Scenarios:
- A collection of only CDs, switched to Vinyl only: the screen keeps showing
  every CD. The scope change is silently ignored until reload.
- A wantlist emptied down to its last item by a sync or a remove path that
  doesn't locally filter: the last item sticks.

**Fix:** Guard on the raw cache (`convexCollection.length === 0`), not on
`derived`. That keeps the protection against a first-sync race it was written
for, without eating real empties.

### H5. Own-collection `applyDiff` is one unchunked mutation
**Confirmed (code). Threshold plausible.** `convex/collection.ts:187-231`,
`convex/wantlist.ts` `applyDiff`, called from `discogs.ts:999` and `:1051`.
Deploy.

The whole collection is one mutation argument. The mutation reads every
existing row, inserts or patches every incoming row, and deletes the rest, all
in one transaction. That will run into Convex's per-mutation caps on documents
written, bytes written, and argument size. From memory those are around 8k
writes and 8 MiB of arguments; confirm against the current docs.

That happens for a first sync or a mass-change sync of a large collection.
Custom fields make rows heavier. The failure is total: the sync throws and
nothing is written. `syncFollowedUser` already chunks at 400 for exactly this
reason; the own-collection path never got the same treatment.

**Fix:** Compute the diff in the action by reading existing signatures with an
internal query, then apply inserts, patches, and deletes in chunked internal
mutations. Deletes must run only after all fetches succeed, which is already
true today.

---

## Medium

### M1. A followed user's cached wantlist is wiped on any transient error
**Confirmed.** `convex/discogs.ts:1177-1184`, `:1235-1247`. Deploy.

`fetchWantlistInternal` failures are swallowed by `catch {}` into `wants = []`.
The action then clears the cached wantlist and appends nothing. Then
`collection_synced_at = now`, so the client won't retry for 24h.

Separately, the clear-then-append refill isn't atomic. A profile that's open
during a refresh flashes empty, and a mid-refill failure leaves it partially
empty.

**Fix:** On a wantlist fetch failure, skip the wantlist clear and refill,
keeping the old cache. Longer term, diff `followed_items` the way H5 proposes.

### M2. The market drip marks releases "checked" when the token was the problem
**Confirmed.** `convex/discogs.ts:~2232-2271`. Deploy.

Any non-2xx advances `fetchedAt`, which pushes the release out 30 days. A
revoked token in the round-robin pool fails with 401/403 every run, so the
releases assigned to it are starved indefinitely. Nothing removes bad tokens
from the pool.

**Fix:** On 401/403, don't advance `fetchedAt`, and drop that token for the
rest of the run.

### M3. The adaptive rate limiter is one global counter
**Confirmed (code). Impact depends on Discogs.** `convex/discogs.ts:93-126`.
Deploy.

`rateLimitRemaining` is module-level and shared by every user's token in the
runtime. If Discogs budgets per token, as the drip's round-robin design
assumes, user A's drained budget throttles user B, and a fresh reading from B
un-throttles A.

However, the Discogs docs describe throttling **by source IP**. If that's what
actually happens, every user shares Convex's egress budget: the global counter
is closer to right, and the drip's "each user's 60/min stays intact" premise is
wrong. It's worth one live check of the header behavior across two tokens
before choosing between a per-token counter and a shared one.

### M4. `vision.identifyCover` has no rate limit or payload cap
**Confirmed.** `convex/vision.ts:18-95`. Deploy.

Any authenticated session can loop the action with arbitrarily large base64
payloads, and every call is a paid Claude vision request on the shared key.

**Fix:** Cap the base64 length. About 2 MB covers a 1280px JPEG with room to
spare. Add a per-user rate limit, following the `bugReports` pattern. That
needs a small table or counter, so flag the schema change.

### M5. Album-detail save is non-atomic across its two Discogs writes
**Confirmed.** `src/app/components/album-detail.tsx:~504-590`.

The folder move succeeds, then a custom-field write fails. The catch skips
`updateAlbum`, so the successful move never reaches local state or the cache.
The retry then sends the stale `oldFolderId`, which the move already
invalidated. `proxyUpdateCollectionInstance` also aborts at its first failing
field, after earlier fields already landed on Discogs.

**Fix:** Commit each successful step to state and the cache before attempting
the next one, and derive `oldFolderId` from the post-move value.

### M6. Play history doesn't reconcile, and `removePlay` loses `lastPlayed`
**Confirmed.** `app-context.tsx:957-969` (hydrates once), `:1571-1580`.
- Deleting a release's most recent play deletes its `lastPlayed` entry instead
  of falling back to the previous play. The release reads "never played" until
  reload, even though the code comment assumes a re-hydration that never
  happens.
- Plays logged on another device never appear until reload.

**Fix:** Recompute `lastPlayed` from `playLog` on delete. Consider deriving
all four play maps reactively from `convexLastPlayed`, as `albums` already is,
instead of a one-time hydrate.

### M7. Play mutations are fire-and-forget with no `.catch`
**Confirmed.** `app-context.tsx:1522`, `:1542`, `:1582`.

`logPlayMut` and `deletePlayMut` failures are unhandled rejections. Combined
with M6's one-time hydration, local play state silently diverges from the
server for the rest of the session.

**Fix:** Add `.catch` with a toast ("Couldn't log play."), and roll back the
optimistic update.

### M8. The session sort "added-old" puts undated releases first
**Confirmed by running.** `convex/stackRules.ts:436-441`. Deploy (shared
engine).

`(dateAddedMs(x) ?? 0)` sinks undated releases in "added-new" but *leads* with
them in "added-old". That contradicts `use-filtered-albums.ts`, which is tested
to sink them in both directions. The "Never played" and "Still undecided"
presets both use `added-old`.

**Fix:** Use `?? Infinity` for ascending.

### M9. `year between` with reversed bounds matches nothing
**Confirmed by running.** `convex/stackRules.ts:266-271`; the builder's two
free-typed year inputs (`stack-builder.tsx:~610-629`). Deploy.

From 1990 / To 1980 produces an empty session with no explanation.

**Fix:** Normalize to `min`/`max` in the engine, which also protects the share
path.

### M10. Manual sync can race the background probe
**Plausible.** `app-context.tsx:~1943-1973`, `~2004-2022`.

`maybeBackgroundSync` sets its in-flight ref but doesn't raise
`isBackgroundSyncing` until after the `proxyFetchSyncSignals` round trip. A
Sync Now tap in that window starts a second `syncSelf`, because `performSync`
has no guard of its own. The writes are idempotent, but it doubles Discogs
calls and makes the progress display flicker.

**Fix:** Put a single in-flight ref inside `performSync`.

---

## Low

| # | Finding | Where | Notes |
|---|---|---|---|
| L1 | Rule and insights date math parses bare `"YYYY-MM-DD"` as UTC midnight: `dateAdded` withinDays/before/after, `countAddedWithin`, presets | `stackRules.ts:212-216, 369-375`; `insights.ts:34-48`; `stack-presets.ts:112,147,180` | Off by up to about a day at window edges for users west of UTC. Client and server parse identically, so share parity holds. Fix with a local-midnight parse (convex can't import `parseDisplayDate`, so mirror it in `albumFields.ts`). |
| L2 | The `marketValue` rule field is dead on the client (`ruleAlbums.marketValue` is always undefined), and `getShared` does an unindexed full scan of `market_values` when a rule uses it | `app-context.tsx:2411`; `stacks.ts:299-310` | Latent: the builder and presets can't create the field today. Either wire it through or remove it from the engine. The scan runs on a public endpoint. |
| L3 | `bugReports.submit`: `diagnostics` has no count or length cap; the rate-limit check `.collect()`s the whole history; `screenshotId` isn't tied to the caller | `bugReports.ts:44-88` | Every other field in the function is capped. |
| L4 | `preferences.recent_searches` has no server-side cap | `preferences.ts:30,58` | Only the client caps it at 8. |
| L5 | `stacks.update` will write `album_ids` onto an auto session | `stacks.ts:70-104` | `create` guards this and `update` doesn't. The server-side backstop for "membership is never stored" is missing. |
| L6 | `proxyRemoveFromCollection` treats any 404 as removed, including a stale `folderId` | `discogs.ts:1426` | Plausible. The release vanishes locally, then reappears on the next sync. |
| L7 | Custom-field save diff matches by array index, not `fieldId` | `album-detail.tsx:~526-535` | Plausible if a sync lands mid-edit and the field list changed. |
| L8 | Cache-write failures after a successful Discogs write are `console`-only (`updateAlbum`, add/remove item, rename folder) | `app-context.tsx:~1269-1286` and siblings | The next re-derive silently reverts the edit until the next sync. |
| L9 | A token revoked mid-session has no recovery path | `app-context.tsx:642-663` | The promote-or-logout logic only runs before `discogsUsername` is set. |
| L10 | Pagination trusts `data.pagination.pages` with no shape check | `discogs.ts:544, 625` | A malformed 200 ends the loop early and then deletes the "missing" rows. Add a `Number.isFinite` guard and throw. |
| L11 | `recoverFromStaleBuild` isn't re-entrant: a second call orphans the first call's promise | `lib/pwa-update.ts:88-107` | Unreachable today (single ErrorBoundary). |

## Informational

- **The OAuth signature omits query parameters.** `buildOAuthHeader`
  (`discogs.ts:28-78`) signs only the `oauth_*` params. RFC 5849 requires query
  params in the base string. Discogs evidently doesn't enforce it, since
  production syncs work, but a stricter Discogs change would break every
  paginated GET at once.
- **`sort=artist` pagination can shift mid-sync.** Adding a release on Discogs
  mid-sync can shift page boundaries: duplicates are deduped, but a skipped
  release is deleted from the cache until the next sync. Rare. Sorting by
  `added` would move the shift to the end.

## Investigated and rejected

- **"`removePlay` removes the wrong release's timestamp from
  `allPlayTimestamps`."** The array is a flat `number[]`; removing one
  occurrence of an equal value gives the same result whichever occurrence goes.
- **StrictMode double-firing** (OAuth verifier reuse, side effects in `setState`
  updaters). There's no `<StrictMode>` in the tree. Latent only.

## Checked and found sound

Auth guard coverage on every public query and mutation. No IDOR, since every
lookup is scoped by the caller's username. `last_played.deletePlay` checks
ownership. `getShared` whitelist, revoked equals unknown, and rule never
shipped. Share-id entropy (128-bit `randomUUID`). `deleteAllUserData` covers
every per-user table plus storage. Admin allowlist fails closed. `shareActivity`
gate. `authedArgs` on every authenticated query. Multi-account promote loop
terminates. The 403-private paths skip the diff write. `sync_status` resets in
`finally`. A mid-pagination throw happens before any write. `master_id` 0
handling. `rateAlbum` isn't optimistic. Rotation, seeded shuffle, and the
streak and month math. `parseDisplayDate`, `accounts.ts`, `coverIdentity`, and
`pressing-format`.

---

## Proposed fix order

One commit per item on `claude/gifted-tesla-cb3471`, each with a regression
test where the code is testable (convex-test or node-env pure tests; there is
no DOM layer).

1. **C1:** projection fix plus test. Deploy.
2. **H1:** callback allowlist plus test. Deploy; set the env var on both
   deployments.
3. **H2:** profile error handling. Deploy.
4. **H4**, then **H3:** client derive fixes. H3 needs the product answer
   above.
5. **M1, M8, M9:** small, contained. Deploy.
6. **H5:** chunked `applyDiff`. Biggest change, and it touches a load-bearing
   file, so it goes after the small ones and is flagged per CLAUDE.md rule 8.
7. **M2, M4, M5, M6, M7, M10**, then the Low table as appetite allows. M3 waits
   on the live header check.
