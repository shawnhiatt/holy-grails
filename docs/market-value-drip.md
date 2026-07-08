# Holy Grails — Per-Release Market Value Drip

**Status:** shipped (Spec 6A → **6A.1**, backend only). The daily cron collects
prices; nothing user-facing reads them yet. Surfacing the values in Insights is
**Session B** (Top Shelf, value-by-folder, value-vs-paid, the purge×value dollar
upgrade, a freshness line) — deferred until the drip has had ~2 weeks to fill
real data.

**One-line summary:** a nightly Convex cron collects the lowest asking price for
each **Discogs release** any user owns and stores it **once per release** in a
shared `market_values` table — cycling through the set about once a month.
Nothing happens at app-open time; the app just reads what the drip has already
collected.

> **6A.1 change (why this doc was rewritten):** market value was originally
> stored *per user* on each collection row. But a release's lowest ask is the
> same for everyone who owns it — so two users owning the same record meant two
> identical fetches and two copies of the same number. It's now keyed on the
> Discogs `releaseId` and shared. That deduplicates the API work, removes a
> fragile sync-preservation invariant, and standardizes the currency.

---

## Why it exists (and why it's a "drip")

Collectors want to know what their records are worth. Discogs exposes a
collection *median* value (one number, on the Insights hero) but **not**
per-album value. To get per-album value you ask Discogs about each release
individually — one HTTP request per release.

Fetching a whole collection on demand (when the user opens Insights) would be
slow, would blow through the 60-requests/minute Discogs budget, and would
compete with the user's own sync. So the value is collected **ahead of time,
slowly, in the background**, and just sits waiting to be read. That's the drip:
a small batch per day, so the ~monthly refresh never contends with anything a
user is doing.

Storing it **per release rather than per user** means each unique record is
fetched once no matter how many members own it — the more the collection overlaps
(popular pressings), the more fetches this saves.

---

## Mental model

> **Market value is not fetched when you open the app or view an album.** It is
> collected by a scheduled server job, a little at a time, and persisted in a
> shared table keyed by Discogs release ID. The app only ever *reads* what the
> job has already written.

There is no client involvement, no user request, no "loading price…" spinner.
The trigger is a clock.

---

## The moving parts

| Piece | File | Role |
|---|---|---|
| Daily cron | `convex/crons.ts` | Fires `marketValueDrip` once a day at 09:00 UTC. |
| Drip orchestrator | `convex/discogs.ts` → `marketValueDrip` (internalAction, `"use node"`) | Seeds the set, fetches a batch of prices round-robin across tokens. |
| Token pool | `convex/discogsHelpers.ts` → `listUsersForMarketDrip` (internalQuery) | Every user with OAuth creds — used only for their tokens. |
| Seed / migrate | `convex/market_values.ts` → `seedFromCollection` (internalMutation) | One shared row per owned release; migrates legacy per-user values. |
| Batch selector | `convex/market_values.ts` → `getDripBatch` (internalQuery) | The stalest / never-fetched releases, ordered by `fetchedAt`. |
| Price writer | `convex/market_values.ts` → `setValue` (internalMutation) | Advances `fetchedAt`; writes `value` on success. |
| Client read | `convex/market_values.ts` → `getForUser` (public query) | The caller's priced releases — for the Session B Insights UI. |
| Constants | `convex/marketValue.ts` | `MARKET_STALE_MS`, `MARKET_BATCH_SIZE`, `MARKET_CURRENCY`. |
| Shared fetch | `convex/discogs.ts` → `discogsFetch` | Rate-limited, OAuth-signed Discogs request (same one the sync uses). |

Everything except the cron and `getForUser` is **internal** — never exposed to a
client. The drip runs entirely server-side.

### Schema

- **`market_values`** (new, shared): `{ releaseId, value?, fetchedAt? }` with
  indexes `by_release` (point lookups / upserts) and `by_fetchedAt` (the drip's
  stalest-first ordering). `value` is `v.union(number, null)`; both `value` and
  `fetchedAt` are optional so a row can exist ("in the set") before it's priced.
- **Legacy, kept only for the migration:** `collection.marketValue` /
  `collection.marketValueFetchedAt` (the old per-user fields) and
  `users.market_cursor` (the old per-user watermark). Nothing reads or writes
  them anymore; the seed copies the collection fields into `market_values` once,
  then they can be dropped in a future clear-then-redeploy pass.

---

## What one run does

Every day at 09:00 UTC, Convex's scheduler calls `marketValueDrip`. It then:

1. **Gets the token pool.** `listUsersForMarketDrip` returns every user with
   Discogs OAuth tokens. If nobody has tokens, it bails. These are used *only*
   as request credentials — the price fetched is the same regardless of whose
   token asks.

2. **Seeds the shared set from collections.** `seedFromCollection` walks every
   collection row and inserts a `market_values` row for any `releaseId` that
   doesn't have one yet — carrying over a value already sitting on the legacy
   per-user field (the one-time migration). This is how new releases (from
   syncs) enter the set, with no changes to the sync write path.

3. **Selects the stalest batch.** `getDripBatch` returns up to
   `MARKET_BATCH_SIZE` (40) releases whose value is missing or older than 30
   days, ordered by `fetchedAt` ascending (never-fetched sort first, then
   oldest).

4. **Fetches each release's price, round-robin across tokens.**
   `GET /marketplace/stats/{releaseId}?curr_abbr=USD` through `discogsFetch`. The
   request is signed with `tokens[i % tokens.length]` so the work spreads across
   every user's independent 60/min budget instead of funnelling through one.
   The stats endpoint returns `lowest_price` as `{ value, currency }` (or `null`
   if nobody's selling one).

5. **Writes the outcome.** `setValue` **always advances `fetchedAt`** (so a
   release just handled moves to the back of the queue), and writes `value` only
   on success — so a transient failure preserves any prior value while still
   preventing the release from clogging the batch.

---

## Staleness and ordering (no cursor)

The old per-user design used a `releaseId` watermark to march through a
collection. The shared design doesn't need one: `getDripBatch` orders by
`fetchedAt` ascending, so the **stalest work is always at the front**.

- Never-fetched rows have `fetchedAt === undefined`, which sorts first — so a
  freshly-seeded release is priced promptly.
- After a release is priced (or attempted), `fetchedAt` becomes "now," moving it
  to the back. Nothing is re-fetched until it ages past `MARKET_STALE_MS` (30
  days).

Net effect: every release's price is refreshed roughly once a month,
continuously, in small batches — and the ordering self-manages, with no cursor
or wraparound bookkeeping.

Because `fetchedAt` advances even on a failed fetch, a persistently-failing
release (e.g. a 404) is not re-hit every day; it simply gets another attempt on
its next 30-day rotation.

---

## The three states of a value

`market_values.value` is deliberately three-state:

| Value | Meaning | Ranking treatment |
|---|---|---|
| `undefined` | In the set but never priced yet. | Excluded. |
| `null` | Priced, but **no active listings** right now. | Excluded (no number). |
| a number | The lowest ask, in `MARKET_CURRENCY` (USD). | Included. |

Storing `null` **with a `fetchedAt`** marks the release as priced for 30 days
like any other, so the drip doesn't re-hit a no-listings release daily.

---

## Currency

A shared value can only be **one** currency. Discogs otherwise localizes
marketplace prices to the *requesting token owner's* currency — which, with
round-robin tokens, would make the same release flip currencies run to run. So
the drip forces `curr_abbr=USD` (`MARKET_CURRENCY` in `convex/marketValue.ts`).
Everyone sees USD regardless of their Discogs locale. If the audience shifts,
change the one constant. (This is the deliberate simplification the original
spec flagged as an acceptable fast-follow — the shared table just makes the
choice explicit.)

---

## How the app reads it

`market_values.getForUser(sessionToken)` returns the priced releases for the
caller's own collection: `{ releaseId, value, fetchedAt }[]`. The Insights value
sections (Session B) subscribe to it and merge by `release_id` onto the `Album`
objects (the `Album` type already carries the optional `marketValue` /
`marketValueFetchedAt` fields — see `discogs-api.ts`).

Session A/6A.1 ships **no UI** — nothing calls `getForUser` yet; the field rides
along typed-but-unused so Session B is a focused read-and-render change.

---

## Migration of already-collected values

Because the original per-user drip may have run before this change, some values
live on the legacy `collection.marketValue` fields. `seedFromCollection` copies
them into the matching `market_values` row on the first run — so nothing already
collected is re-fetched. Deleting the legacy fields would just cost one extra
drip cycle to re-collect, so migration is a convenience, not a requirement.

To migrate immediately after deploy instead of waiting for 09:00 UTC, run
`marketValueDrip` (or just `seedFromCollection`) once from the Convex dashboard.

---

## Tests

`convex/market_values.test.ts` (edge-runtime, `convex-test`):

- `seedFromCollection` — one shared row per release across owners (deduped),
  migrates a legacy per-user value, idempotent on re-run.
- `getDripBatch` — never-fetched + stale releases, stalest first, capped.
- `setValue` — writes value + timestamp (incl. `null`); advances `fetchedAt`
  while preserving value on the failure path; no-ops for an unknown release.
- `getForUser` — returns priced releases for the caller's collection only;
  rejects an unauthenticated caller.

(There is no longer an `applyDiff`-preservation test — see below.)

---

## What this design removed

- **The `applyDiff` clobber invariant is gone.** Market value used to live on
  the collection row, so the sync's `applyDiff` had to be careful never to
  overwrite it. Now the value lives in a separate table the sync never touches,
  so the whole concern (and its test) disappeared.
- **The per-user cursor is gone** — replaced by `fetchedAt` ordering.

---

## Deploy

Because this adds a **table + indexes**, a **cron**, and new functions, it does
not exist on production until `npx convex deploy` runs. The old per-user fields
are kept in the schema as legacy-optional, so this is a **single clean deploy**
with no field-removal ordering hazard. No client behavior changes.

To verify: Convex dashboard → `market_values` table → confirm rows appear
(seeded) and `value`/`fetchedAt` populate over successive days; the Crons/Logs
view shows `marketValueDrip` firing daily.

---

## Scaling — the honest analysis

The shared model is a strictly better scaling story than the per-user one,
because it attacks total *work* (fetch each release once) rather than just
parallelizing duplicated work. But it's still a single daily action, so there
are ceilings.

### What got better

- **Deduplicated fetches.** Total Discogs requests scale with the number of
  *unique* releases across all users, not the sum of collection sizes. With
  overlap, that grows sub-linearly in user count.
- **Parallel budget preserved.** Fetching through **one** token would have
  collapsed everything onto a single 60/min budget. The round-robin across all
  users' tokens keeps the aggregate budget ≈ N × 60/min while still fetching
  each release once.
- **Simpler correctness.** No per-row invariant with the sync; no cursor.

### What still has ceilings

1. **The seed is O(collection + market_values) in one mutation each run.**
   `seedFromCollection` collects all collection rows and all `market_values`
   rows to diff them. Fine at the current scale; at large scale it can exceed a
   mutation's document/byte limits. It's wrapped in `try/catch` so a failed seed
   degrades gracefully (that run just prices whatever's already seeded). The
   scale-up is to paginate the seed, or move seeding into the sync write path
   (`applyDiff`/`addItem` upsert a `market_values` row per new release) so no
   full scan is needed.

2. **The fetch loop is a single sequential action.** Same shape as before — one
   action prices `MARKET_BATCH_SIZE` releases sequentially. At 40/run it's well
   within Convex's per-action time limit, and because the set is now *shared*,
   40/run drains the global backlog faster than 40/user/day did. If the unique-
   release backlog ever needs more throughput, fan the fetch out into
   per-chunk scheduled actions (the same pattern the old doc described), still
   round-robining tokens.

3. **`getForUser` does O(collection) point lookups per call.** Fine for one
   Insights screen render; if it becomes hot, scope differently (e.g. return the
   whole small `market_values` table and filter client-side, or cache).

### Bottom line

- **Small scale (friend group):** ship as-is.
- **When the daily seed/fetch wall-clock creeps toward a couple of minutes, or
  the seed starts brushing mutation limits:** move seeding into the sync write
  path (kills the full-collection scan) and, if needed, fan the fetch out. Both
  are contained changes on top of this shared model — not a rethink.

---

## Future — Session B (surfacing)

Once the drip has filled real values, Session B adds the Insights UI — all
threshold-gated, excluding `null`/`undefined` — reading `market_values.getForUser`
and merging onto `Album.marketValue`:

- **Top Shelf** — top 5 most valuable records (gate: 10+ valued).
- **Value by folder** — a value column/toggle on By Folder (≥70% valued).
- **Value vs. paid** — "worth ~$X, paid $Y" (5+ albums with both).
- **Purge × value** — upgrade Spec 4's count-only "Cutting deadweight" callout to
  a dollar figure.
- **Freshness line** — "Values updated {Xd ago}" from `max(fetchedAt)`.

The backend and the `Album.marketValue` type are already in place; Session B is
the read query wiring + UI.
