# Holy Grails — Per-Album Market Value Drip

**Status:** shipped (Spec 6, Session A — backend only). The daily cron collects
prices; nothing user-facing reads them yet. Surfacing the values in Insights is
**Session B** (Top Shelf, value-by-folder, value-vs-paid, the purge×value dollar
upgrade, a freshness line) — deferred until the drip has had ~2 weeks to fill
real data.

**One-line summary:** a nightly Convex cron walks each user's collection ~40
records at a time, asks Discogs the lowest asking price for each, and stamps it
onto the collection row — cycling through the whole collection about once a
month. Nothing happens at app-open time; the app just reads whatever the drip
has already collected.

---

## Why it exists (and why it's a "drip")

Collectors want to know what their records are worth. Discogs exposes a
collection *median* value (one number, already shown on the Insights hero), but
**not** per-album value. To get per-album value you have to ask Discogs about
each release individually — one HTTP request per record.

A full collection can be hundreds of records. Fetching all of them on demand
(when the user opens Insights) would be slow, would blow through the user's
60-requests/minute Discogs budget, and would compete with their own
collection sync. An earlier, more ambitious "fetch everything, live" attempt was
abandoned as inaccurate and over-complicated.

So the value is collected **ahead of time, slowly, in the background**, and just
sits on the row waiting to be read. That's the drip: a small batch per user per
day, so the ~monthly refresh never contends with anything the user is doing.

---

## Mental model

The single most important thing to understand:

> **Market value is not fetched when you open the app or view an album.** It is
> collected by a scheduled server job, a little at a time, and persisted onto
> your collection rows. The app only ever *reads* what the job has already
> written.

There is no client involvement, no user request, no "loading price…" spinner.
The trigger is a clock.

---

## The moving parts

| Piece | File | Role |
|---|---|---|
| Daily cron | `convex/crons.ts` | Fires `marketValueDrip` once a day at 09:00 UTC. |
| Drip orchestrator | `convex/discogs.ts` → `marketValueDrip` (internalAction, `"use node"`) | Loops users, fetches prices, writes them, advances the cursor. |
| User list | `convex/discogsHelpers.ts` → `listUsersForMarketDrip` (internalQuery) | Every user with OAuth creds + their `market_cursor`. |
| Batch selector | `convex/collection.ts` → `getMarketDripBatch` (internalQuery) | Up to N stale rows above the cursor. |
| Price writer | `convex/collection.ts` → `setMarketValue` (internalMutation) | Patches `marketValue` + `marketValueFetchedAt` onto a row. |
| Cursor writer | `convex/users.ts` → `setMarketCursor` (internalMutation) | Saves the resumable watermark. |
| Pure helpers | `convex/marketValue.ts` | `nextMarketCursor` (advance/wrap) + `MARKET_STALE_MS`, `MARKET_BATCH_SIZE`. |
| Shared fetch | `convex/discogs.ts` → `discogsFetch` | Rate-limited, OAuth-signed Discogs request (same one the sync uses). |

All of these except the cron are **internal** functions — they are never exposed
to a client. The drip runs entirely server-side and signs Discogs requests with
each user's stored OAuth tokens.

### Schema additions

- `collection.marketValue: v.optional(v.union(v.number(), v.null()))`
- `collection.marketValueFetchedAt: v.optional(v.number())`
- `users.market_cursor: v.optional(v.number())`

---

## What one run does

Every day at 09:00 UTC, Convex's scheduler calls `marketValueDrip` — no user, no
request, just the clock. The action then:

1. **Lists users to process.** `listUsersForMarketDrip` returns everyone with
   Discogs OAuth tokens, along with their `market_cursor` (a `releaseId`
   bookmark, `0` if never run).

2. **For each user, grabs a small batch of stale records.**
   `getMarketDripBatch` asks, using the `by_username_and_release` index:
   > *give me up to `MARKET_BATCH_SIZE` (40) rows for this user whose `releaseId`
   > is above the cursor, and whose price is missing or older than 30 days*,
   ordered ascending by `releaseId`.
   Fresh rows (priced within 30 days) are skipped; the index range skips
   everything at or below the cursor.

3. **For each record in the batch, asks Discogs the price.**
   `GET /marketplace/stats/{releaseId}` through `discogsFetch`. The stats
   endpoint returns `lowest_price` as `{ value, currency }` (or `null` if nobody
   is selling one). The value is the current lowest **ask**.

4. **Writes the price onto the row.** `setMarketValue` patches `marketValue`
   (the number, or `null`) and `marketValueFetchedAt` (a timestamp) onto that
   collection row.

5. **Moves the bookmark.** After the batch, `nextMarketCursor` computes the new
   `market_cursor` and `setMarketCursor` saves it.

Per-user work is wrapped in a `try/catch`: one user's revoked token or error
must not kill the whole run — it's logged and the loop moves on.

---

## The cursor and staleness (drip mechanics)

`users.market_cursor` is just a **bookmark**: the `releaseId` the job stopped at
last time.

- Each run does **`MARKET_BATCH_SIZE` (40) records per user**. A 500-record
  collection therefore takes ~13 days to price the first time.
- The next day's run continues from the bookmark.
- When the job reaches the end of a user's collection — i.e. `getMarketDripBatch`
  returns **fewer than the limit** — `nextMarketCursor` **wraps the bookmark
  back to `0`** (`convex/marketValue.ts`). The cycle restarts.
- On the next pass from `0`, the 30-day staleness filter means only records
  whose price has aged past `MARKET_STALE_MS` get re-fetched.

Net effect: **every record's price is refreshed roughly once a month,
continuously, in tiny background batches.**

The cursor also advances past a record even if *that* record's fetch failed
(step 3 errored) — so a single persistently-failing release isn't re-hit every
day; it simply gets another chance on the next wraparound. Its
`marketValueFetchedAt` stays unset, so it's still counted as "needs fetching."

---

## The three states of a value (this trips people up)

`marketValue` is deliberately a three-state field:

| Value | Meaning | Ranking treatment |
|---|---|---|
| `undefined` | Never fetched — the drip hasn't reached this row yet. | Excluded. |
| `null` | Fetched, but **no active listings** right now. | Excluded (no number to rank). |
| a number | The lowest ask (in whatever currency Discogs returned). | Included. |

Storing `null` **with a timestamp** is intentional: it marks the record as
"priced" for 30 days like any other, so the drip doesn't hammer a no-listings
release every single day. The `v.union(v.number(), v.null())` schema type is what
lets "fetched, no listings" (`null`) be distinguished from "never fetched"
(`undefined`).

---

## How the app reads it

The price is just another column on the collection row. When `app-context.tsx`
derives local `albums` from the Convex `collection` cache subscription, it
carries `marketValue` / `marketValueFetchedAt` onto each `Album` (the fields are
on the `Album` type in `discogs-api.ts`).

In **Session A (this backend), nothing in the UI reads them** — they ride along
typed-but-unused so that **Session B is UI-only** (no further schema or sync
changes needed to surface them).

---

## The one genuinely fiddly invariant: `applyDiff` must not clobber the value

The collection cache is kept current by the sync's `applyDiff`
(`convex/collection.ts`), which reconciles the cached collection against a fresh
fetch from Discogs. The fresh fetch does **not** include market value (Discogs'
collection endpoint doesn't return it) — so a naive "replace the row" would wipe
the price the drip worked to collect.

It's safe because `applyDiff` uses **`ctx.db.patch`** (a shallow merge), not
`ctx.db.replace`, and the album payload it patches with doesn't contain the
market fields — so those fields are left untouched on rows it rewrites. The
`albumSignature` used to decide whether a row changed also excludes the market
fields, so a drip-only update never triggers sync write churn, and a real change
(e.g. a condition edit) patches without touching the price.

There are no `replaceAll` callers on the collection table. **A test locks this
invariant** (`convex/marketValue.test.ts`) for both the unchanged-row and
changed-row paths — if anyone ever switches `applyDiff` to `replace`, or folds a
market field into the album payload, that test fails.

---

## Tests

`convex/marketValue.test.ts` (edge-runtime, `convex-test`):

- `nextMarketCursor` — advance on a full batch, wrap-to-0 on a short/empty batch.
- `getMarketDripBatch` — returns never-fetched + stale rows above the cursor,
  ascending; honors the cursor watermark; caps at the limit.
- `setMarketValue` — writes value + timestamp; stores `null` distinctly from
  never-fetched; no-ops when the row has left the collection.
- **`applyDiff` preserves `marketValue`** on rows it patches (unchanged and
  changed) — the critical invariant above.

The pure `nextMarketCursor` is unit-tested directly because the cursor advance
lives in the `"use node"` action, which the test harness can't drive; the query
and mutation are driven directly through `convex-test`.

---

## Deploy

Because this adds a **cron** plus schema fields and functions, it does not exist
on production until `npx convex deploy` runs (the Convex CLI ignores `*.test.ts`
and deploys crons alongside functions). No client behavior changes, so deploy
order isn't load-bearing relative to the Vercel frontend — but **the drip won't
start until the deploy lands**, at which point it begins on the next 09:00 UTC
tick.

To verify it's working: Convex dashboard → `collection` table → confirm
`marketValue` / `marketValueFetchedAt` are populating over successive days; and
the Crons/Logs view shows `marketValueDrip` firing daily.

---

## Scaling — the honest analysis

This is a deliberate small-scale v1 (the spec scoped it to the current user's own
collection, with an explicit "revisit only if the ~2-week fill proves
annoying"). It will hit a wall as the user count grows, but at a **predictable
point**, and the fix is a well-worn Convex pattern rather than a rethink.

### What does *not* get worse with scale

- **Discogs rate limits.** The 60-requests/minute limit is **per authenticated
  user token**, not per app. Every user's drip spends *their own* budget, and 40
  requests fits comfortably in one user's minute. Adding users does not shrink
  anyone's budget — the work is embarrassingly parallel.
- **Per-user cost.** `getMarketDripBatch` is indexed (`by_username_and_release`),
  the cursor/staleness math is O(batch), and the two extra columns are
  negligible storage. A single user's cost is constant regardless of how many
  other users exist.

### What *does* get worse: it's a single sequential job

The cron fires **one** `marketValueDrip` action, and inside it a
`for (const user of users)` loop processes users **one after another**. Total
runtime therefore grows linearly with the user count:

| Users | Rough runtime of the daily run | Status |
|---|---|---|
| 1–2 | seconds | fine |
| 10 | ~2–5 min | fine |
| 20 | ~7–10 min | approaching the edge |
| 100 | ~40+ min | broken |
| 1000 | many hours | very broken |

(Each user ≈ up to 40 Discogs calls at a few hundred ms each ≈ 10–20s.)

The wall is **Convex's per-action execution-time limit** — a single action is
capped (on the order of several minutes; confirm the current figure against
Convex's limits docs). A sequential loop over all users is *one* action, so
somewhere around **20–50 users it starts timing out mid-run**, and the users
late in the loop simply don't get processed that day. It fails *gracefully*
(late users skipped, no data corruption), but it fails.

### The fix when you outgrow it: fan-out with the scheduler

Instead of one action looping all users, the cron becomes a **dispatcher** that
enqueues one scheduled action **per user**:

```ts
// cron handler:
const users = await ctx.runQuery(internal.discogsHelpers.listUsersForMarketDrip, {});
for (let i = 0; i < users.length; i++) {
  // stagger to smear load across the day and avoid a synchronized burst
  await ctx.scheduler.runAfter(i * 3000, internal.discogs.marketValueDripForUser, {
    username: users[i].username,
  });
}
```

Each user's 40-request batch becomes its own short (~15s) action with its own
time budget, run concurrently by Convex. This scales to thousands because **no
single invocation ever does more than one user's work.** The per-user body
already exists — you're lifting it into `marketValueDripForUser`, not rewriting
it.

Two things to fix at the same time:

1. **The shared throttle variable.** `discogsFetch` tracks `rateLimitRemaining`
   in a *module-level* variable (fine for one user at a time; it was built for
   the single-user sync). Under parallel per-user actions, different users'
   rate-limit headers would clobber each other. Either make throttle state
   per-invocation, or lean on the existing 429-retry backstop (which already
   handles it correctly). Because each user has an independent Discogs budget,
   the shared variable is only an efficiency wrinkle, not a correctness bug — but
   worth cleaning up when parallelizing.
2. **Smear the load.** At 1000 users you don't want all of them firing at
   09:00 UTC. It's a *daily* drip with 24 hours of runway, so stagger
   (`runAfter(i * Nms)`) or shard users into hourly buckets. Convex's scheduler
   concurrency also naturally spreads them.

### Things to watch in the 100 → 1000 range

- **Discogs fair-use / IP limits.** 1000 users × 40/day ≈ 40k requests/day from
  Convex's egress IPs. Per-*token* you're fine, but if Discogs ever throttles by
  IP or consumer key, a synchronized burst could trip it. Staggering (which you
  want anyway) mostly solves this, and the 30-day staleness already prevents
  redundant fetches.
- **Convex cost.** 1000 short actions/day is trivial for Convex's pricing — not
  where cost shows up.
- **Batch size is a per-user lever, not a scaling lever.** `MARKET_BATCH_SIZE`
  controls how fast one user's collection fills (~monthly refresh at 40/day); it
  has nothing to do with user count. Don't reach for it to solve a scaling
  problem.

### Bottom line thresholds

- **Up to ~15–20 users:** ship exactly what's there, zero changes.
- **~20–50 users:** convert the sequential loop to per-user fan-out. A
  half-day change, no schema impact.
- **100–1000+:** fan-out + stagger + per-invocation throttle. Same pattern, just
  add the smearing.

The design doesn't scale *itself*, but it degrades predictably and the upgrade
path is contained. Do the fan-out refactor when the daily run's wall-clock time
starts creeping toward a couple of minutes — that's the early-warning signal,
well before the hard timeout.

---

## Future — Session B (surfacing)

Once the drip has filled real values (~2 weeks, or test against a small
collection), Session B adds the Insights UI, all threshold-gated and excluding
`null`/`undefined`:

- **Top Shelf** — top 5 most valuable records (gate: 10+ valued).
- **Value by folder** — a value column/toggle on the existing By Folder tab
  (once ≥70% of the collection has values).
- **Value vs. paid** — "worth ~$X, paid $Y" when both sides have enough data
  (5+ albums with both `pricePaid` and `marketValue`).
- **Purge × value** — upgrade Spec 4's count-only "Cutting deadweight" callout to
  a dollar figure ("{N} Cut records worth ~${X}").
- **Freshness line** — "Values updated {Xd ago}" from `max(marketValueFetchedAt)`.

All of this is UI-only — the backend and the `Album.marketValue` type are
already in place.
